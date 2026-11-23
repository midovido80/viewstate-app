-- A cooperation is a durable history record, even when a recalculation deletes its match.
create table viewstate_circle.cooperations (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references viewstate_circle.circles(id) on delete cascade,
  match_id uuid not null,
  property_id uuid not null,
  request_id uuid not null,
  requester_id uuid not null references auth.users(id) on delete cascade,
  publisher_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null,
  recipient_id uuid not null,
  purpose text not null check (purpose in ('availability','viewing','fit')),
  terms text not null check (terms in ('','agree_first','split_evenly')),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','closed','completed')),
  requester_confirmed boolean not null default false,
  publisher_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id<>publisher_id and sender_id<>recipient_id
    and sender_id in (requester_id,publisher_id) and recipient_id in (requester_id,publisher_id))
);

create unique index circle_cooperation_current_pair
  on viewstate_circle.cooperations(circle_id,request_id,property_id)
  where status in ('pending','accepted','completed');
create index circle_cooperation_history on viewstate_circle.cooperations(circle_id,created_at desc);

create table viewstate_circle.cooperation_outbox (
  id uuid primary key default gen_random_uuid(),
  cooperation_id uuid not null references viewstate_circle.cooperations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null,
  attempts integer not null default 0,
  retry_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (cooperation_id,user_id,event)
);
create index circle_cooperation_retry on viewstate_circle.cooperation_outbox(retry_at)
  where accepted_at is null and attempts<5;
alter table viewstate_circle.cooperations enable row level security;
alter table viewstate_circle.cooperation_outbox enable row level security;
revoke all on viewstate_circle.cooperations, viewstate_circle.cooperation_outbox from public,anon,authenticated;

create function viewstate_circle.cooperation_available(c viewstate_circle.cooperations)
returns boolean language sql stable set search_path='' as $$
  select exists (
    select 1 from viewstate_circle.properties p
    join viewstate_circle.requests r on r.circle_id=p.circle_id
    where p.id=c.property_id and r.id=c.request_id and p.circle_id=c.circle_id
      and p.publisher_id=c.publisher_id and r.owner_id=c.requester_id
      and p.state='published' and not p.source_deleted
      and coalesce(p.facts->>'marketingStatus','active')='active'
      and coalesce(p.facts->>'rentalAvailability','available')='available'
      and viewstate_circle.publisher_active(c.circle_id,c.requester_id)
      and viewstate_circle.publisher_active(c.circle_id,c.publisher_id)
  )
$$;
revoke all on function viewstate_circle.cooperation_available(viewstate_circle.cooperations)
  from public,anon,authenticated;

-- Lifecycle mutations bump the circle after updating the source or membership.
-- Close active cooperation before a later relisting or rejoin can resurrect it.
create function viewstate_circle.close_unavailable_cooperations()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update viewstate_circle.cooperations c
  set status='closed',updated_at=now()
  where c.circle_id=new.id and c.status in ('pending','accepted')
    and not viewstate_circle.cooperation_available(c);
  return new;
end $$;
revoke all on function viewstate_circle.close_unavailable_cooperations()
  from public,anon,authenticated;
create trigger close_unavailable_circle_cooperations after update of revision on viewstate_circle.circles
  for each row when (new.revision is distinct from old.revision)
  execute function viewstate_circle.close_unavailable_cooperations();

create function public.vs_circle_cooperation_request(
  p_circle uuid, p_match uuid, p_purpose text, p_terms text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare who uuid; opportunity viewstate_circle.current_matches; next_id uuid; peer uuid;
begin
  perform 1 from viewstate_circle.circles where id=p_circle for update;
  who := viewstate_circle.require_member(p_circle);
  select m.* into opportunity from viewstate_circle.current_matches m
    where m.id=p_match and m.circle_id=p_circle and who in (m.requester,m.publisher);
  if not found then raise exception 'CIRCLE_MATCH_UNAVAILABLE' using errcode='42501'; end if;
  if coalesce(p_purpose,'') not in ('availability','viewing','fit')
     or p_terms is null or p_terms not in ('','agree_first','split_evenly') then
    raise exception 'CIRCLE_COOPERATION_INVALID' using errcode='22023';
  end if;
  select c.id into next_id from viewstate_circle.cooperations c
    where c.circle_id=p_circle and c.request_id=opportunity.request_id
      and c.property_id=opportunity.property_id and c.status in ('pending','accepted','completed');
  if found then return next_id; end if;

  peer := case when who=opportunity.requester then opportunity.publisher else opportunity.requester end;
  insert into viewstate_circle.cooperations(circle_id,match_id,property_id,request_id,requester_id,
      publisher_id,sender_id,recipient_id,purpose,terms)
    values(p_circle,p_match,opportunity.property_id,opportunity.request_id,opportunity.requester,
      opportunity.publisher,who,peer,p_purpose,p_terms) returning id into next_id;
  insert into viewstate_circle.cooperation_outbox(cooperation_id,user_id,event)
    values(next_id,peer,'requested');
  perform viewstate_circle.bump(p_circle);
  return next_id;
end $$;

create function public.vs_circle_cooperation_list(p_circle uuid)
returns table(id uuid,match_id uuid,property_id uuid,requester_id uuid,publisher_id uuid,
  sender_id uuid,recipient_id uuid,purpose text,terms text,status text,
  requester_confirmed boolean,publisher_confirmed boolean,created_at timestamptz,
  updated_at timestamptz,source_key text,actionable boolean)
language plpgsql stable security definer set search_path='' as $$
declare who uuid := viewstate_circle.require_member(p_circle);
begin
  return query select c.id,c.match_id,c.property_id,c.requester_id,c.publisher_id,c.sender_id,
    c.recipient_id,c.purpose,c.terms,c.status,c.requester_confirmed,c.publisher_confirmed,
    c.created_at,c.updated_at,case when who=c.publisher_id and not p.source_deleted then p.source_key end,
    c.status in ('pending','accepted') and viewstate_circle.cooperation_available(c)
  from viewstate_circle.cooperations c
  left join viewstate_circle.properties p on p.id=c.property_id and p.publisher_id=who
  where c.circle_id=p_circle and who in (c.requester_id,c.publisher_id)
  order by c.created_at desc,c.id limit 100;
end $$;

create function public.vs_circle_cooperation_action(p_circle uuid,p_id uuid,p_action text)
returns text language plpgsql security definer set search_path='' as $$
declare who uuid; c viewstate_circle.cooperations; next_status text; peer uuid; signal text;
begin
  perform 1 from viewstate_circle.circles where id=p_circle for update;
  who := viewstate_circle.require_member(p_circle);
  select * into c from viewstate_circle.cooperations x
    where x.id=p_id and x.circle_id=p_circle and who in (x.requester_id,x.publisher_id)
    for update;
  if not found then raise exception 'CIRCLE_COOPERATION_UNAVAILABLE' using errcode='42501'; end if;

  next_status := c.status;
  peer := case when who=c.requester_id then c.publisher_id else c.requester_id end;
  case p_action
    when 'accept' then
      if who<>c.recipient_id then raise exception 'CIRCLE_COOPERATION_RECIPIENT_REQUIRED' using errcode='42501'; end if;
      if c.status='accepted' then return c.status; end if;
      if c.status<>'pending' or not viewstate_circle.cooperation_available(c) then
        raise exception 'CIRCLE_COOPERATION_UNAVAILABLE' using errcode='22023';
      end if;
      next_status := 'accepted';
      signal := next_status;
    when 'decline' then
      if who<>c.recipient_id then raise exception 'CIRCLE_COOPERATION_RECIPIENT_REQUIRED' using errcode='42501'; end if;
      if c.status='declined' then return c.status; end if;
      if c.status<>'pending' then raise exception 'CIRCLE_COOPERATION_INVALID_STATE' using errcode='22023'; end if;
      next_status := 'declined';
      signal := next_status;
    when 'close' then
      if c.status='closed' then return c.status; end if;
      if c.status not in ('pending','accepted') then raise exception 'CIRCLE_COOPERATION_INVALID_STATE' using errcode='22023'; end if;
      next_status := 'closed';
      signal := next_status;
    when 'confirm' then
      if c.status='completed' then return c.status; end if;
      if c.status<>'accepted' or not viewstate_circle.cooperation_available(c) then
        raise exception 'CIRCLE_COOPERATION_UNAVAILABLE' using errcode='22023';
      end if;
      if (who=c.requester_id and c.requester_confirmed) or (who=c.publisher_id and c.publisher_confirmed) then
        return c.status;
      end if;
      c.requester_confirmed := c.requester_confirmed or who=c.requester_id;
      c.publisher_confirmed := c.publisher_confirmed or who=c.publisher_id;
      if c.requester_confirmed and c.publisher_confirmed then
        next_status := 'completed';
        signal := next_status;
      else
        signal := 'confirmation_requested';
      end if;
    else
      raise exception 'CIRCLE_COOPERATION_INVALID_ACTION' using errcode='22023';
  end case;

  update viewstate_circle.cooperations x set status=next_status,updated_at=now(),
    requester_confirmed=c.requester_confirmed,publisher_confirmed=c.publisher_confirmed
    where x.id=c.id;
  insert into viewstate_circle.cooperation_outbox(cooperation_id,user_id,event)
    values(c.id,peer,signal) on conflict do nothing;
  perform viewstate_circle.bump(p_circle);
  return next_status;
end $$;

create function public.vs_circle_cooperation_push_claim()
returns table(id uuid,token text,attempt integer,cooperation_id uuid)
language sql volatile security definer set search_path='' as $$
  with picked as (
    select o.id,d.token from viewstate_circle.cooperation_outbox o
    join viewstate_circle.cooperations c on c.id=o.cooperation_id
    join viewstate_circle.push_devices d on d.user_id=o.user_id
    where o.accepted_at is null and o.attempts<5 and o.retry_at<=now()
      and viewstate_circle.publisher_active(c.circle_id,c.requester_id)
      and viewstate_circle.publisher_active(c.circle_id,c.publisher_id)
      and (o.event not in ('requested','confirmation_requested')
        or (viewstate_circle.cooperation_available(c)
          and ((o.event='requested' and c.status='pending')
            or (o.event='confirmation_requested' and c.status='accepted'))))
    order by o.retry_at,o.id limit 20 for update of o skip locked
  )
  update viewstate_circle.cooperation_outbox o
  set attempts=o.attempts+1,retry_at=now()+interval '2 minutes'
  from picked where o.id=picked.id returning o.id,picked.token,o.attempts,o.cooperation_id
$$;

create function public.vs_circle_cooperation_push_result(p_id uuid,p_attempt integer,p_status text,p_token text)
returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if coalesce(p_status,'') not in ('accepted','retry','unregistered','permanent') then
    raise exception 'CIRCLE_PUSH_RESULT_INVALID' using errcode='22023';
  end if;
  update viewstate_circle.cooperation_outbox
  set accepted_at=case when p_status='accepted' then now() end,
    attempts=case when p_status in ('permanent','unregistered') then 5 else attempts end,
    retry_at=now()+make_interval(mins=>2*p_attempt)
  where id=p_id and attempts=p_attempt and accepted_at is null returning user_id into recipient;
  if p_status='unregistered' and recipient is not null then
    delete from viewstate_circle.push_devices where token=p_token and user_id=recipient;
  end if;
end $$;

revoke all on function public.vs_circle_cooperation_request(uuid,uuid,text,text),
  public.vs_circle_cooperation_list(uuid),public.vs_circle_cooperation_action(uuid,uuid,text)
  from public,anon;
grant execute on function public.vs_circle_cooperation_request(uuid,uuid,text,text),
  public.vs_circle_cooperation_list(uuid),public.vs_circle_cooperation_action(uuid,uuid,text)
  to authenticated;
revoke all on function public.vs_circle_cooperation_push_claim(),
  public.vs_circle_cooperation_push_result(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.vs_circle_cooperation_push_claim(),
  public.vs_circle_cooperation_push_result(uuid,integer,text,text) to service_role;
