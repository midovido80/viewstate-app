-- Circle request facts are an explicit projection, separate from private requirements.
create table viewstate_circle.requests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references viewstate_circle.circles(id),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_key uuid not null,
  revision bigint not null default 1,
  facts jsonb not null,
  unique (circle_id, owner_id, source_key)
);
create table viewstate_circle.matches (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references viewstate_circle.circles(id),
  request_id uuid not null references viewstate_circle.requests(id) on delete cascade,
  property_id uuid not null references viewstate_circle.properties(id) on delete cascade,
  request_revision bigint not null,
  property_revision bigint not null,
  score numeric not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  unique (request_id, property_id)
);
create table viewstate_circle.push_devices (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create table viewstate_circle.push_outbox (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references viewstate_circle.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempts integer not null default 0,
  retry_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (match_id, user_id)
);
alter table viewstate_circle.requests enable row level security;
alter table viewstate_circle.matches enable row level security;
alter table viewstate_circle.push_devices enable row level security;
alter table viewstate_circle.push_outbox enable row level security;
revoke all on viewstate_circle.requests, viewstate_circle.matches, viewstate_circle.push_devices,
  viewstate_circle.push_outbox from public, anon, authenticated;
create index circle_requests_circle on viewstate_circle.requests(circle_id);
create index circle_matches_circle on viewstate_circle.matches(circle_id);
create index circle_push_devices_owner on viewstate_circle.push_devices(user_id);
create index circle_push_retry on viewstate_circle.push_outbox(retry_at) where accepted_at is null and attempts<5;

create function public.vs_circle_request(
  p_circle uuid, p_source uuid, p_areas text[], p_max numeric, p_period text,
  p_bedrooms integer, p_bathrooms integer, p_withdraw boolean default false
) returns void language plpgsql security definer set search_path='' as $$
declare who uuid; next_facts jsonb;
begin
  perform 1 from viewstate_circle.circles where id=p_circle for update;
  who := viewstate_circle.require_member(p_circle);
  if p_withdraw is true then
    delete from viewstate_circle.requests where circle_id=p_circle and owner_id=who and source_key=p_source;
    if found then perform viewstate_circle.bump(p_circle); end if;
    return;
  end if;
  if p_withdraw is null or p_source is null or p_areas is null or cardinality(p_areas)>30
     or exists(select 1 from unnest(p_areas) a where a is null or a !~ '^[a-z][a-z0-9_]{0,63}$')
     or cardinality(p_areas)<>(select count(distinct a) from unnest(p_areas) a)
     or p_max is null or p_max::text in ('NaN','Infinity','-Infinity') or p_max<=0 or p_max>10000000
     or coalesce(p_period,'') not in ('daily','monthly','yearly')
     or p_bedrooms not between 0 and 100 or p_bathrooms not between 0 and 100 then
    raise exception 'CIRCLE_REQUEST_INVALID' using errcode='22023';
  end if;
  if not exists(select 1 from viewstate_circle.requests where circle_id=p_circle and owner_id=who and source_key=p_source)
     and (select count(*) from viewstate_circle.requests where circle_id=p_circle)>=200 then
    raise exception 'CIRCLE_REQUEST_LIMIT' using errcode='22023';
  end if;
  next_facts := jsonb_strip_nulls(jsonb_build_object(
    'purpose','rent','propertyType','apartment','preferredAreaIds',p_areas,
    'preferredAreaMode',case when cardinality(p_areas)=0 then 'all_kuwait' else 'specific_areas' end,
    'budget',jsonb_build_object('maximum',p_max,'currencyCode','KWD'),
    'rentalPeriodId',p_period,'bedroomsMinimum',p_bedrooms,'bathroomsMinimum',p_bathrooms,'notes',''
  ));
  insert into viewstate_circle.requests as existing(circle_id,owner_id,source_key,facts)
  values(p_circle,who,p_source,next_facts)
  on conflict(circle_id,owner_id,source_key) do update
    set facts=excluded.facts, revision=existing.revision+1 where existing.facts is distinct from excluded.facts;
  if found then perform viewstate_circle.bump(p_circle); end if;
end $$;

create function public.vs_circle_register_push(p_token text, p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor();
begin
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,128}\]$' or p_enabled is null then
    raise exception 'CIRCLE_PUSH_TOKEN_INVALID' using errcode='22023';
  end if;
  if p_enabled then
    -- One active device per account during the pilot. Re-registration transfers the device.
    perform pg_advisory_xact_lock(hashtextextended(who::text,1));
    delete from viewstate_circle.push_devices where user_id=who and token<>p_token;
    insert into viewstate_circle.push_devices(token,user_id) values(p_token,who)
    on conflict(token) do update set user_id=excluded.user_id, updated_at=now();
  else
    delete from viewstate_circle.push_devices where user_id=who and token=p_token;
  end if;
end $$;

-- A result and its notifications expire immediately when a source revision changes.
create view viewstate_circle.current_matches as
select m.*, r.owner_id as requester, p.publisher_id as publisher
from viewstate_circle.matches m
join viewstate_circle.requests r on r.id=m.request_id and r.circle_id=m.circle_id
join viewstate_circle.properties p on p.id=m.property_id and p.circle_id=m.circle_id
where r.revision=m.request_revision and p.revision=m.property_revision
  and p.state='published' and not p.source_deleted
  and coalesce(p.facts->>'marketingStatus','active')='active'
  and coalesce(p.facts->>'rentalAvailability','available')='available'
  and viewstate_circle.publisher_active(m.circle_id,r.owner_id)
  and viewstate_circle.publisher_active(m.circle_id,p.publisher_id);
revoke all on viewstate_circle.current_matches from public, anon, authenticated;

create function public.vs_circle_matches(p_circle uuid)
returns table(id uuid,property_id uuid,score numeric,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare who uuid := viewstate_circle.require_member(p_circle);
begin
  return query select m.id,m.property_id,m.score,m.created_at from viewstate_circle.current_matches m
    where m.circle_id=p_circle and who in (m.requester,m.publisher)
    order by m.created_at desc,m.id limit 100;
end $$;

create function public.vs_circle_worker_jobs() returns setof uuid
language sql stable security definer set search_path='' as $$
  select q.circle_id from viewstate_circle.change_queue q
  group by q.circle_id order by min(q.created_at), q.circle_id limit 5
$$;

create function public.vs_circle_worker_snapshot(p_circle uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('revision',c.revision,
    'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'owner',p.publisher_id,'facts',p.facts))
      from viewstate_circle.properties p where p.circle_id=c.id and p.state='published'
        and viewstate_circle.valid_facts(p.facts,p.source_key)
        and viewstate_circle.publisher_active(c.id,p.publisher_id)), '[]'::jsonb),
    'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'owner',r.owner_id,'facts',r.facts))
      from viewstate_circle.requests r where r.circle_id=c.id
        and viewstate_circle.publisher_active(c.id,r.owner_id)), '[]'::jsonb))
  from viewstate_circle.circles c where c.id=p_circle
$$;

create function public.vs_circle_worker_commit(p_circle uuid,p_revision bigint,p_pairs jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
  select revision into current_revision from viewstate_circle.circles where id=p_circle for update;
  if current_revision is null or current_revision is distinct from p_revision then return false; end if;
  if not exists(select 1 from viewstate_circle.change_queue where circle_id=p_circle and revision<=p_revision) then return false; end if;
  if jsonb_typeof(p_pairs) is distinct from 'array' or jsonb_array_length(p_pairs)>1000 then
    raise exception 'CIRCLE_PAIRS_INVALID' using errcode='22023';
  end if;

  delete from viewstate_circle.matches m where m.circle_id=p_circle and not exists (
    select 1 from jsonb_to_recordset(p_pairs) x(request_id uuid, property_id uuid)
    where x.request_id=m.request_id and x.property_id=m.property_id
  );
  with inserted as (
    insert into viewstate_circle.matches(circle_id,request_id,property_id,request_revision,property_revision,score)
    select p_circle,r.id,p.id,r.revision,p.revision,x.score
    from jsonb_to_recordset(p_pairs) x(request_id uuid,property_id uuid,score numeric)
    join viewstate_circle.requests r on r.id=x.request_id and r.circle_id=p_circle
    join viewstate_circle.properties p on p.id=x.property_id and p.circle_id=p_circle
    where r.owner_id<>p.publisher_id and p.state='published' and not p.source_deleted
      and coalesce(p.facts->>'marketingStatus','active')='active'
      and coalesce(p.facts->>'rentalAvailability','available')='available'
      and viewstate_circle.publisher_active(p_circle,r.owner_id)
      and viewstate_circle.publisher_active(p_circle,p.publisher_id)
    on conflict(request_id,property_id) do nothing
    returning id,request_id,property_id
  )
  insert into viewstate_circle.push_outbox(match_id,user_id)
  select i.id,u.user_id from inserted i
  join viewstate_circle.requests r on r.id=i.request_id
  join viewstate_circle.properties p on p.id=i.property_id
  cross join lateral (values(r.owner_id),(p.publisher_id)) u(user_id);

  update viewstate_circle.matches m set request_revision=r.revision,property_revision=p.revision,score=x.score
  from jsonb_to_recordset(p_pairs) x(request_id uuid,property_id uuid,score numeric)
  join viewstate_circle.requests r on r.id=x.request_id and r.circle_id=p_circle
  join viewstate_circle.properties p on p.id=x.property_id and p.circle_id=p_circle
  where m.circle_id=p_circle and m.request_id=r.id and m.property_id=p.id;

  delete from viewstate_circle.change_queue where circle_id=p_circle and revision<=p_revision;
  return true;
end $$;

create function public.vs_circle_push_claim()
returns table(id uuid,token text,attempt integer)
language sql volatile security definer set search_path='' as $$
  with picked as (
    select o.id,d.token from viewstate_circle.push_outbox o
    join viewstate_circle.current_matches m on m.id=o.match_id and o.user_id in (m.requester,m.publisher)
    join viewstate_circle.push_devices d on d.user_id=o.user_id
    where o.accepted_at is null and o.attempts<5 and o.retry_at<=now()
    order by o.retry_at,o.id limit 20 for update of o skip locked
  )
  update viewstate_circle.push_outbox o
  set attempts=o.attempts+1,retry_at=now()+interval '2 minutes'
  from picked where o.id=picked.id returning o.id,picked.token,o.attempts
$$;

create function public.vs_circle_push_result(p_id uuid,p_attempt integer,p_status text,p_token text)
returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if coalesce(p_status,'') not in ('accepted','retry','unregistered','permanent') then
    raise exception 'CIRCLE_PUSH_RESULT_INVALID' using errcode='22023';
  end if;
  update viewstate_circle.push_outbox
  set accepted_at=case when p_status='accepted' then now() end,
    attempts=case when p_status in ('permanent','unregistered') then 5 else attempts end,
    retry_at=now()+make_interval(mins=>2*p_attempt)
  where id=p_id and attempts=p_attempt and accepted_at is null returning user_id into recipient;
  if p_status='unregistered' and recipient is not null then
    delete from viewstate_circle.push_devices where token=p_token and user_id=recipient;
  end if;
end $$;

revoke all on function public.vs_circle_request(uuid,uuid,text[],numeric,text,integer,integer,boolean),
  public.vs_circle_register_push(text,boolean), public.vs_circle_matches(uuid) from public,anon;
grant execute on function public.vs_circle_request(uuid,uuid,text[],numeric,text,integer,integer,boolean),
  public.vs_circle_register_push(text,boolean), public.vs_circle_matches(uuid) to authenticated;
revoke all on function public.vs_circle_worker_jobs(),public.vs_circle_worker_snapshot(uuid),
  public.vs_circle_worker_commit(uuid,bigint,jsonb),public.vs_circle_push_claim(),
  public.vs_circle_push_result(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.vs_circle_worker_jobs(),public.vs_circle_worker_snapshot(uuid),
  public.vs_circle_worker_commit(uuid,bigint,jsonb),public.vs_circle_push_claim(),
  public.vs_circle_push_result(uuid,integer,text,text) to service_role;

-- Owners need the latest revision even when a withdrawn listing is hidden from the catalog.
create function public.vs_circle_my_publication(p_circle uuid,p_source text)
returns bigint language plpgsql stable security definer set search_path='' as $$
declare who uuid := viewstate_circle.require_member(p_circle);
begin
  return coalesce((select p.revision from viewstate_circle.properties p
    where p.circle_id=p_circle and p.publisher_id=who and p.source_key=p_source),0);
end $$;
revoke all on function public.vs_circle_my_publication(uuid,text) from public,anon;
grant execute on function public.vs_circle_my_publication(uuid,text) to authenticated;

create function viewstate_circle.drop_revoked_requests() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from viewstate_circle.requests where circle_id=new.circle_id and owner_id=new.user_id;
  return new;
end $$;
revoke all on function viewstate_circle.drop_revoked_requests() from public,anon,authenticated;
create trigger circle_drop_revoked_requests after update of state on viewstate_circle.members
for each row when (new.state='revoked' and old.state is distinct from new.state)
execute function viewstate_circle.drop_revoked_requests();

create or replace function viewstate_circle.on_workspace_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb; incoming jsonb := new.payload->'records'; circle uuid;
begin
  previous := case when tg_op='UPDATE' then old.payload->'records' else '{}'::jsonb end;
  -- Reserve both sets of circle locks in the same order before touching either projection.
  for circle in
    select c.id from viewstate_circle.circles c where exists (
      select 1 from viewstate_circle.properties p where p.circle_id=c.id and p.publisher_id=new.user_id and not p.source_deleted
    ) or exists (
      select 1 from viewstate_circle.requests r where r.circle_id=c.id and r.owner_id=new.user_id
    ) order by c.id for update
  loop
    delete from viewstate_circle.requests r
      where r.circle_id=circle and r.owner_id=new.user_id
        and previous ? ('requirement/' || r.source_key::text)
        and not (incoming ? ('requirement/' || r.source_key::text));
    if found then perform viewstate_circle.bump(circle); end if;
  end loop;
  perform viewstate_circle.reconcile_workspace_lifecycle(new.user_id,previous,incoming);
  return new;
end $$;
