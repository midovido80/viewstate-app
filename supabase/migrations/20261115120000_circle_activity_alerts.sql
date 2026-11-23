-- Durable, private alerts. The worker sends only generic copy and an event kind.
create table viewstate_circle.activity_outbox (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references viewstate_circle.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('invite','listing','match')),
  listing_id uuid references viewstate_circle.properties(id) on delete cascade,
  match_id uuid references viewstate_circle.matches(id) on delete cascade,
  member_generation bigint not null,
  attempts integer not null default 0,
  retry_at timestamptz not null default now(),
  accepted_at timestamptz
);
alter table viewstate_circle.activity_outbox enable row level security;
revoke all on viewstate_circle.activity_outbox from public,anon,authenticated;
create index circle_activity_retry on viewstate_circle.activity_outbox(retry_at)
  where accepted_at is null and attempts<5;

create function viewstate_circle.enqueue_invitation_alert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.state <> 'invited' then return null; end if;
  if tg_op = 'UPDATE' then
    if old.state = new.state and old.generation = new.generation then return null; end if;
  end if;
  insert into viewstate_circle.activity_outbox(circle_id,user_id,kind,member_generation)
  values(new.circle_id,new.user_id,'invite',new.generation);
  return null;
end $$;
create trigger circle_invitation_alert after insert or update of state,generation on viewstate_circle.members
for each row execute function viewstate_circle.enqueue_invitation_alert();

create function viewstate_circle.enqueue_listing_alert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'UPDATE' then
    if new.state = 'withdrawn' and old.state <> new.state then
      delete from viewstate_circle.activity_outbox where listing_id=new.id and accepted_at is null;
    end if;
  end if;
  if new.state <> 'published' or new.source_deleted
    or coalesce(new.facts->>'marketingStatus','active') <> 'active'
    or coalesce(new.facts->>'rentalAvailability','available') <> 'available' then return null; end if;
  if tg_op = 'UPDATE' then
    if old.state = 'published' then return null; end if;
  end if;
  insert into viewstate_circle.activity_outbox(circle_id,user_id,kind,listing_id,member_generation)
  select new.circle_id,m.user_id,'listing',new.id,m.generation
  from viewstate_circle.members m
  where m.circle_id=new.circle_id and m.state='active' and m.user_id<>new.publisher_id;
  return null;
end $$;
create trigger circle_listing_alert after insert or update of state on viewstate_circle.properties
for each row execute function viewstate_circle.enqueue_listing_alert();

-- The existing match outbox covers the two participants. Other active members
-- receive a generic activity alert and cannot read the matched requirement.
create function viewstate_circle.enqueue_match_activity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into viewstate_circle.activity_outbox(circle_id,user_id,kind,match_id,member_generation)
  select new.circle_id,m.user_id,'match',new.id,m.generation
  from viewstate_circle.members m
  join viewstate_circle.requests r on r.id=new.request_id
  join viewstate_circle.properties p on p.id=new.property_id
  where m.circle_id=new.circle_id and m.state='active'
    and m.user_id not in (r.owner_id,p.publisher_id);
  return null;
end $$;
create trigger circle_match_activity after insert on viewstate_circle.matches
for each row execute function viewstate_circle.enqueue_match_activity();

-- Existing Pilot installations already have the optional webhook helper.
do $$
begin
  if to_regprocedure('viewstate_circle.wake_delivery_worker_trigger()') is not null then
    create trigger circle_activity_webhook after insert on viewstate_circle.activity_outbox
    for each row when (new.kind = 'invite') execute function viewstate_circle.wake_delivery_worker_trigger();
  end if;
end $$;

create function public.vs_circle_activity_push_claim()
returns table(id uuid,token text,attempt integer,kind text)
language sql volatile security definer set search_path='' as $$
  with picked as (
    select o.id,d.token from viewstate_circle.activity_outbox o
    join viewstate_circle.members m on m.circle_id=o.circle_id and m.user_id=o.user_id
      and m.generation=o.member_generation
    join viewstate_circle.push_devices d on d.user_id=o.user_id
    left join viewstate_circle.properties p on p.id=o.listing_id and p.circle_id=o.circle_id
    left join viewstate_circle.current_matches match on match.id=o.match_id and match.circle_id=o.circle_id
    where o.accepted_at is null and o.attempts<5 and o.retry_at<=now()
      and (o.kind='invite' and m.state='invited'
        or o.kind='match' and m.state='active' and match.id is not null
        or o.kind='listing' and m.state='active'
        and p.state='published' and not p.source_deleted
        and coalesce(p.facts->>'marketingStatus','active')='active'
        and coalesce(p.facts->>'rentalAvailability','available')='available'
        and viewstate_circle.publisher_active(o.circle_id,p.publisher_id))
    order by o.retry_at,o.id limit 20 for update of o skip locked
  )
  update viewstate_circle.activity_outbox o set attempts=o.attempts+1,retry_at=now()+interval '2 minutes'
  from picked where o.id=picked.id returning o.id,picked.token,o.attempts,o.kind
$$;

create function public.vs_circle_activity_push_result(p_id uuid,p_attempt integer,p_status text,p_token text)
returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if coalesce(p_status,'') not in ('accepted','retry','unregistered','permanent') then
    raise exception 'CIRCLE_PUSH_RESULT_INVALID' using errcode='22023';
  end if;
  update viewstate_circle.activity_outbox
  set accepted_at=case when p_status='accepted' then now() end,
    attempts=case when p_status in ('permanent','unregistered') then 5 else attempts end,
    retry_at=now()+make_interval(mins=>2*p_attempt)
  where id=p_id and attempts=p_attempt and accepted_at is null returning user_id into recipient;
  if p_status='unregistered' and recipient is not null then
    delete from viewstate_circle.push_devices where token=p_token and user_id=recipient;
  end if;
end $$;

create function public.vs_circle_match_requirement(p_circle uuid,p_match uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare who uuid:=viewstate_circle.require_member(p_circle);
begin
  return (select r.facts - 'notes' from viewstate_circle.current_matches m
  join viewstate_circle.requests r on r.id=m.request_id
  where m.circle_id=p_circle and m.id=p_match and who in (m.publisher,m.requester)
    and viewstate_circle.valid_request_facts(r.facts));
end $$;

revoke all on function viewstate_circle.enqueue_invitation_alert(),viewstate_circle.enqueue_listing_alert(),viewstate_circle.enqueue_match_activity()
  from public,anon,authenticated;
revoke all on function public.vs_circle_activity_push_claim(),public.vs_circle_activity_push_result(uuid,integer,text,text)
  from public,anon,authenticated;
grant execute on function public.vs_circle_activity_push_claim(),public.vs_circle_activity_push_result(uuid,integer,text,text)
  to service_role;
revoke all on function public.vs_circle_match_requirement(uuid,uuid) from public,anon;
grant execute on function public.vs_circle_match_requirement(uuid,uuid) to authenticated;
