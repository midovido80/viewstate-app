create table viewstate_circle.notification_inbox (
  id uuid primary key default gen_random_uuid(),
  recipient uuid not null references auth.users(id) on delete cascade,
  circle_id uuid references viewstate_circle.circles(id) on delete cascade,
  origin uuid not null,
  kind text not null check (kind in ('invite','listing','match','cooperation','test')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deliver boolean not null default true,
  unique (recipient,kind,origin)
);
create index circle_inbox_recipient on viewstate_circle.notification_inbox(recipient,created_at desc);
create table viewstate_circle.notification_delivery (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references viewstate_circle.notification_inbox(id) on delete cascade,
  token text not null references viewstate_circle.push_devices(token) on delete cascade,
  attempts integer not null default 0,
  due_at timestamptz not null default now(),
  ticket text,
  status text not null default 'queued',
  failure_reason text check (failure_reason in ('invalid_credentials','sender_mismatch','message_too_big','provider_http','device_unregistered','retry_limit')),
  unique (notice_id,token)
);
create index circle_delivery_due on viewstate_circle.notification_delivery(due_at)
  where status in ('queued','ticket');
alter table viewstate_circle.notification_inbox enable row level security;
alter table viewstate_circle.notification_delivery enable row level security;
revoke all on viewstate_circle.notification_inbox,viewstate_circle.notification_delivery from public,anon,authenticated;

create function viewstate_circle.capture_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_circle uuid; event_kind text; source_id uuid;
begin
  if tg_table_name='activity_outbox' then
    if new.kind='match' then return null; end if;
    target_circle:=new.circle_id; event_kind:=new.kind;
    source_id:=new.id;
  elsif tg_table_name='push_outbox' then
    select m.circle_id into target_circle from viewstate_circle.matches m where id=new.match_id;
    event_kind:='match'; source_id:=new.match_id;
  else
    select c.circle_id into target_circle from viewstate_circle.cooperations c where id=new.cooperation_id;
    event_kind:='cooperation'; source_id:=new.id;
  end if;
  if target_circle is not null then
    insert into viewstate_circle.notification_inbox(recipient,circle_id,origin,kind)
    values(new.user_id,target_circle,source_id,event_kind) on conflict do nothing;
  end if;
  return null;
end $$;
revoke all on function viewstate_circle.capture_notification() from public,anon,authenticated;

-- Trigger order puts the durable inbox write before the existing webhook wake-up.
create trigger circle_00_inbox_activity after insert on viewstate_circle.activity_outbox
for each row execute function viewstate_circle.capture_notification();
create trigger circle_00_inbox_match after insert on viewstate_circle.push_outbox
for each row execute function viewstate_circle.capture_notification();
create trigger circle_00_inbox_cooperation after insert on viewstate_circle.cooperation_outbox
for each row execute function viewstate_circle.capture_notification();

-- Previously sent invitations still awaiting an answer get a badge without a delayed push.
insert into viewstate_circle.notification_inbox(recipient,circle_id,origin,kind,deliver)
select m.user_id,m.circle_id,coalesce(o.id,gen_random_uuid()),'invite',false
from viewstate_circle.members m
left join lateral (
  select a.id from viewstate_circle.activity_outbox a
  where a.circle_id=m.circle_id and a.user_id=m.user_id and a.member_generation=m.generation and a.kind='invite'
  order by a.retry_at desc limit 1
) o on true where m.state='invited'
on conflict do nothing;

create function public.vs_circle_notification_inbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor();
begin
  return jsonb_build_object(
    'unread',(select count(*) from viewstate_circle.notification_inbox where recipient=who and read_at is null),
    'entries',coalesce((
      select jsonb_agg(to_jsonb(item) order by (item.read_at is not null),item.created_at desc,item.id)
      from (
        select id,kind,created_at,read_at from viewstate_circle.notification_inbox
        where recipient=who order by (read_at is not null),created_at desc,id limit 100
      ) item
    ),'[]'::jsonb)
  );
end $$;

create function public.vs_circle_notification_read(p_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor(); target uuid;
begin
  update viewstate_circle.notification_inbox set read_at=coalesce(read_at,now())
  where id=p_id and recipient=who
  returning circle_id into target;
  if viewstate_circle.is_member(target) then return target; end if;
  -- Pending invitees see the invitation in their own invitations list.
  return null;
end $$;

create function viewstate_circle.read_resolved_invitation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update viewstate_circle.notification_inbox set read_at=now()
  where recipient=new.user_id and circle_id=new.circle_id and kind='invite' and read_at is null;
  return null;
end $$;
create trigger circle_read_resolved_invitation after update of state on viewstate_circle.members
for each row when (old.state='invited' and new.state<>'invited')
execute function viewstate_circle.read_resolved_invitation();
revoke all on function viewstate_circle.read_resolved_invitation() from public,anon,authenticated;

create or replace function public.vs_circle_register_push(p_token text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor();
begin
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,128}\]$' or p_enabled is null then
    raise exception 'CIRCLE_PUSH_TOKEN_INVALID' using errcode='22023';
  end if;
  if p_enabled then
    insert into viewstate_circle.push_devices(token,user_id) values(p_token,who)
    on conflict(token) do update set user_id=excluded.user_id,updated_at=now()
    where push_devices.user_id<>excluded.user_id;
  else
    delete from viewstate_circle.push_devices where user_id=who and token=p_token;
  end if;
end $$;

create function public.vs_circle_notification_device(p_token text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from viewstate_circle.push_devices where token=p_token and user_id=viewstate_circle.actor())
$$;

create function public.vs_circle_test_notification(p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor(); notice uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(who::text,14));
  if not public.vs_circle_notification_device(p_token) then
    raise exception 'CIRCLE_PUSH_NOT_REGISTERED' using errcode='42501';
  end if;
  if exists(select 1 from viewstate_circle.notification_inbox
    where recipient=who and kind='test' and created_at>now()-interval '1 minute') then
    raise exception 'CIRCLE_PUSH_TEST_RATE_LIMIT' using errcode='22023';
  end if;
  insert into viewstate_circle.notification_inbox(recipient,origin,kind,deliver)
  values(who,gen_random_uuid(),'test',false) returning id into notice;
  insert into viewstate_circle.notification_delivery(notice_id,token) values(notice,p_token);
  if to_regprocedure('viewstate_circle.wake_delivery_worker()') is not null then
    begin perform viewstate_circle.wake_delivery_worker();
    exception when others then raise warning 'Circle worker wake-up failed'; end;
  end if;
end $$;

create function public.vs_circle_notification_claim()
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
      and (d.status='ticket' or (d.status='queued' and d.attempts<5 and n.read_at is null and (
        n.kind='test'
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

create function public.vs_circle_notification_result(p_id uuid,p_attempt integer,p_status text,p_ticket text default null,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare dropped_token text; who uuid;
begin
  if coalesce(p_status,'') not in ('queued','ticket','delivered_to_provider','unregistered','failed')
    or (p_status='ticket' and coalesce(p_ticket,'')='') then
    raise exception 'CIRCLE_PUSH_RESULT_INVALID' using errcode='22023';
  end if;
  update viewstate_circle.notification_delivery d
  set status=case when p_status='queued' and d.attempts>=5 then 'failed' else p_status end,
      ticket=case when p_status='ticket' then p_ticket else null end,
      failure_reason=case when p_status='queued' and d.attempts>=5 then 'retry_limit' else p_reason end,
      due_at=now()+case when p_status='ticket' then interval '15 minutes' else interval '2 minutes' end
  from viewstate_circle.notification_inbox n
  where d.id=p_id and d.notice_id=n.id and d.attempts=p_attempt and d.status in ('queued','ticket')
  returning d.token,n.recipient into dropped_token,who;
  if found and p_status='unregistered' then
    delete from viewstate_circle.push_devices where token=dropped_token and user_id=who;
  end if;
end $$;

revoke all on function public.vs_circle_notification_inbox(),public.vs_circle_notification_read(uuid),
  public.vs_circle_notification_device(text),public.vs_circle_test_notification(text) from public,anon;
grant execute on function public.vs_circle_notification_inbox(),public.vs_circle_notification_read(uuid),
  public.vs_circle_notification_device(text),public.vs_circle_test_notification(text) to authenticated;
revoke all on function public.vs_circle_notification_claim(),public.vs_circle_notification_result(uuid,integer,text,text,text)
  from public,anon,authenticated;
grant execute on function public.vs_circle_notification_claim(),public.vs_circle_notification_result(uuid,integer,text,text,text)
  to service_role;
