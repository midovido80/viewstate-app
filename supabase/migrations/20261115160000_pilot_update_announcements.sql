alter table viewstate_circle.push_devices
  add column update_channel text, add column update_runtime text;

create table viewstate_circle.update_announcements (
  id uuid primary key,
  channel text not null,
  runtime text not null,
  created_at timestamptz not null default now()
);
alter table viewstate_circle.update_announcements enable row level security;
revoke all on viewstate_circle.update_announcements from public,anon,authenticated;

alter table viewstate_circle.notification_inbox drop constraint notification_inbox_kind_check;
alter table viewstate_circle.notification_inbox add constraint notification_inbox_kind_check
  check (kind in ('invite','listing','match','cooperation','test','app_update'));

create function public.vs_circle_update_device(p_token text,p_channel text,p_runtime text)
returns void language plpgsql security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor();
begin
  update viewstate_circle.push_devices set update_channel=p_channel,update_runtime=p_runtime
  where user_id=who and token=p_token and p_channel='viewstate-next-pilot'
    and p_runtime ~ '^viewstate-next-android-[0-9]{1,6}$'
    and (update_channel,update_runtime) is distinct from (p_channel,p_runtime);
end $$;

create function public.vs_circle_announce_update(p_group uuid,p_channel text,p_runtime text)
returns integer language plpgsql security definer set search_path='' as $$
declare queued integer;
begin
  if p_group is null or p_channel is distinct from 'viewstate-next-pilot'
    or p_runtime is null or p_runtime !~ '^viewstate-next-android-[0-9]{1,6}$' then
    raise exception 'PILOT_UPDATE_INVALID' using errcode='22023';
  end if;
  insert into viewstate_circle.update_announcements(id,channel,runtime)
  values(p_group,p_channel,p_runtime) on conflict do nothing;
  if not found then
    return 0;
  end if;
  -- The app badge comes from Expo's device-specific availability check.
  -- These entries are internal delivery records, hidden from the account inbox.
  with notices as (
    insert into viewstate_circle.notification_inbox(recipient,origin,kind,read_at,deliver)
    select distinct d.user_id,p_group,'app_update',now(),false
    from viewstate_circle.push_devices d where d.update_channel=p_channel and d.update_runtime=p_runtime
    returning id,recipient
  )
  insert into viewstate_circle.notification_delivery(notice_id,token)
  select n.id,d.token from notices n
  join viewstate_circle.push_devices d on d.user_id=n.recipient
  where d.update_channel=p_channel and d.update_runtime=p_runtime;
  get diagnostics queued=row_count;
  return queued;
end $$;

revoke all on function public.vs_circle_update_device(text,text,text) from public,anon;
grant execute on function public.vs_circle_update_device(text,text,text) to authenticated;
revoke all on function public.vs_circle_announce_update(uuid,text,text) from public,anon,authenticated;
grant execute on function public.vs_circle_announce_update(uuid,text,text) to service_role;

create or replace function public.vs_circle_notification_inbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor();
begin
  return jsonb_build_object(
    'unread',(select count(*) from viewstate_circle.notification_inbox where recipient=who and kind<>'app_update' and read_at is null),
    'entries',coalesce((
      select jsonb_agg(to_jsonb(item) order by (item.read_at is not null),item.created_at desc,item.id)
      from (
        select id,kind,created_at,read_at from viewstate_circle.notification_inbox
        where recipient=who and kind<>'app_update' order by (read_at is not null),created_at desc,id limit 100
      ) item
    ),'[]'::jsonb)
  );
end $$;

create or replace function public.vs_circle_notification_claim()
returns table(id uuid,token text,attempt integer,kind text,ticket text)
language plpgsql security definer set search_path='' as $$
begin
  insert into viewstate_circle.notification_delivery(notice_id,token)
  select n.id,d.token from viewstate_circle.notification_inbox n
  join viewstate_circle.push_devices d on d.user_id=n.recipient
  where n.deliver and n.read_at is null and n.created_at>now()-interval '1 day'
    and d.updated_at<=n.created_at
  order by n.id,d.token
  on conflict do nothing;
  return query with picked as (
    select d.id,n.kind from viewstate_circle.notification_delivery d
    join viewstate_circle.notification_inbox n on n.id=d.notice_id
    join viewstate_circle.push_devices device on device.token=d.token and device.user_id=n.recipient
    where n.created_at>now()-interval '1 day' and d.due_at<=now()
      and (d.status='ticket' or (d.status='queued' and d.attempts<5 and (n.read_at is null or n.kind='app_update') and (
        n.kind='test'
        or n.kind='app_update' and exists (
          select 1 from viewstate_circle.update_announcements a
          where a.id=n.origin and device.update_channel=a.channel and device.update_runtime=a.runtime
        )
        or n.kind='invite' and exists (
          select 1 from viewstate_circle.activity_outbox a
          join viewstate_circle.members m on m.circle_id=a.circle_id and m.user_id=a.user_id and m.generation=a.member_generation
          where a.id=n.origin and a.accepted_at is null and m.state='invited'
        )
        or n.kind='match' and exists (
          select 1 from viewstate_circle.current_matches m
          join viewstate_circle.push_outbox o on o.match_id=m.id and o.user_id=n.recipient
          where m.id=n.origin and n.recipient in (m.requester,m.publisher) and o.accepted_at is null
        )
        or n.kind='listing' and exists (
          select 1 from viewstate_circle.activity_outbox a
          join viewstate_circle.properties p on p.id=a.listing_id and p.circle_id=a.circle_id
          join viewstate_circle.members m on m.circle_id=a.circle_id and m.user_id=a.user_id and m.generation=a.member_generation
          where a.id=n.origin and a.accepted_at is null and m.state='active'
            and p.state='published' and not p.source_deleted
            and coalesce(p.facts->>'marketingStatus','active')='active'
            and coalesce(p.facts->>'rentalAvailability','available')='available'
            and viewstate_circle.publisher_active(p.circle_id,p.publisher_id)
        )
        or n.kind='cooperation' and exists (
          select 1 from viewstate_circle.cooperation_outbox o
          join viewstate_circle.cooperations c on c.id=o.cooperation_id
          where o.id=n.origin and o.accepted_at is null
            and viewstate_circle.publisher_active(c.circle_id,c.requester_id)
            and viewstate_circle.publisher_active(c.circle_id,c.publisher_id)
            and (o.event not in ('requested','confirmation_requested')
              or viewstate_circle.cooperation_available(c) and (
                o.event='requested' and c.status='pending'
                or o.event='confirmation_requested' and c.status='accepted'))
        )
      )))
    order by d.due_at,d.id limit 20 for update of d skip locked
  )
  update viewstate_circle.notification_delivery d
  set attempts=d.attempts+1,due_at=now()+interval '2 minutes'
  from picked p where d.id=p.id
  returning d.id,d.token,d.attempts,p.kind,d.ticket;
end $$;
