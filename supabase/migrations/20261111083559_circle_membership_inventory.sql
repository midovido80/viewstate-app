-- Stage 01 only. Additive; never opens or reads private account workspaces.
create schema viewstate_circle;
revoke all on schema viewstate_circle from public, anon;
grant usage on schema viewstate_circle to authenticated;

create table viewstate_circle.circles (
 id uuid primary key,
 owner_id uuid not null references auth.users(id),
 name text not null check(length(btrim(name)) between 1 and 80),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now()
);
create table viewstate_circle.members (
 circle_id uuid not null references viewstate_circle.circles(id),
 user_id uuid not null references auth.users(id),
 state text not null check(state in ('invited','active','revoked')),
 generation bigint not null default 1,
 primary key(circle_id,user_id)
);
create index circle_members_by_user on viewstate_circle.members(user_id,circle_id);
create table viewstate_circle.properties (
 id uuid primary key default gen_random_uuid(),
 circle_id uuid not null references viewstate_circle.circles(id),
 publisher_id uuid not null references auth.users(id),
 source_key text not null check(length(source_key) between 1 and 128),
 revision bigint not null check(revision>0),
 state text not null check(state in ('published','withdrawn')),
 facts jsonb not null,
 last_operation uuid not null,
 operation_hash text not null,
 updated_at timestamptz not null default now(),
 unique(circle_id,publisher_id,source_key)
);
create index circle_properties_by_publisher on viewstate_circle.properties(publisher_id,circle_id);
-- Durable recompute intent; a later server worker stage owns consumption.
create table viewstate_circle.change_queue (
 circle_id uuid not null references viewstate_circle.circles(id),
 revision bigint not null,
 created_at timestamptz not null default now(),
 primary key(circle_id,revision)
);

create function viewstate_circle.actor() returns uuid language plpgsql stable security invoker set search_path='' as $$
declare who uuid:=auth.uid();
begin
 if who is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'CIRCLE_AUTH_REQUIRED' using errcode='42501'; end if;
 return who;
end $$;
create function viewstate_circle.is_member(p_circle uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from viewstate_circle.members m where m.circle_id=p_circle and m.user_id=auth.uid() and m.state='active')
 and auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
$$;
create function viewstate_circle.publisher_active(p_circle uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from viewstate_circle.members m where m.circle_id=p_circle and m.user_id=p_user and m.state='active')
$$;
create function viewstate_circle.require_member(p_circle uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor();
begin
 if not viewstate_circle.is_member(p_circle) then raise exception 'CIRCLE_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 return who;
end $$;
create function viewstate_circle.bump(p_circle uuid) returns void language plpgsql security definer set search_path='' as $$
declare next_revision bigint;
begin
 update viewstate_circle.circles set revision=revision+1 where id=p_circle returning revision into next_revision;
 insert into viewstate_circle.change_queue(circle_id,revision) values(p_circle,next_revision);
end $$;

alter table viewstate_circle.circles enable row level security;
alter table viewstate_circle.members enable row level security;
alter table viewstate_circle.properties enable row level security;
alter table viewstate_circle.change_queue enable row level security;
revoke all on all tables in schema viewstate_circle from public,anon,authenticated;
grant select on viewstate_circle.circles,viewstate_circle.members,viewstate_circle.properties to authenticated;
create policy circle_read on viewstate_circle.circles for select to authenticated using(viewstate_circle.is_member(id));
create policy circle_members_read on viewstate_circle.members for select to authenticated using(user_id=(select auth.uid()) or viewstate_circle.is_member(circle_id));
create policy circle_properties_read on viewstate_circle.properties for select to authenticated using(
 state='published' and viewstate_circle.is_member(circle_id) and viewstate_circle.publisher_active(circle_id,publisher_id)
);

create function public.vs_circle_create(p_id uuid,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor(); existing_owner uuid;
begin
 select owner_id into existing_owner from viewstate_circle.circles where id=p_id;
 if found then
  if existing_owner<>who then raise exception 'CIRCLE_ID_CONFLICT' using errcode='42501'; end if;
  return p_id;
 end if;
 insert into viewstate_circle.circles(id,owner_id,name) values(p_id,who,btrim(p_name));
 insert into viewstate_circle.members(circle_id,user_id,state) values(p_id,who,'active');
 return p_id;
end $$;

create function public.vs_circle_member(p_circle uuid,p_user uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor(); circle_owner uuid;
begin
 select owner_id into circle_owner from viewstate_circle.circles where id=p_circle for update;
 if circle_owner is distinct from who or not viewstate_circle.is_member(p_circle) then raise exception 'CIRCLE_OWNER_REQUIRED' using errcode='42501'; end if;
 if p_user=who then raise exception 'CIRCLE_OWNER_MEMBERSHIP_FIXED' using errcode='22023'; end if;
 if p_action='invite' then
  insert into viewstate_circle.members(circle_id,user_id,state) values(p_circle,p_user,'invited')
  on conflict(circle_id,user_id) do update set state='invited',generation=viewstate_circle.members.generation+1 where viewstate_circle.members.state='revoked';
 elsif p_action='revoke' then
  update viewstate_circle.members set state='revoked',generation=generation+1 where circle_id=p_circle and user_id=p_user and state<>'revoked';
  if found then
   update viewstate_circle.properties set state='withdrawn',revision=revision+1,updated_at=now() where circle_id=p_circle and publisher_id=p_user and state='published';
   perform viewstate_circle.bump(p_circle);
  end if;
 else raise exception 'CIRCLE_ACTION_INVALID' using errcode='22023'; end if;
end $$;

create function public.vs_circle_accept(p_circle uuid) returns void language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor(); membership_state text;
begin
 perform 1 from viewstate_circle.circles where id=p_circle for update;
 select state into membership_state from viewstate_circle.members where circle_id=p_circle and user_id=who;
 if membership_state='active' then return; end if;
 if membership_state is distinct from 'invited' then raise exception 'CIRCLE_INVITATION_REQUIRED' using errcode='42501'; end if;
 update viewstate_circle.members set state='active' where circle_id=p_circle and user_id=who;
 perform viewstate_circle.bump(p_circle);
end $$;

-- No free text, source notes, phone numbers, media or exact address fields.
-- Keep the pilot projection deliberately bounded to residential rental facts.
create function viewstate_circle.valid_facts(f jsonb,p_source text) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; n numeric;
begin
 if f is null or jsonb_typeof(f)<>'object' or pg_column_size(f)>16384 then return false; end if;
 if exists(select 1 from jsonb_object_keys(f) e(k) where e.k not in ('core','activeOffer','typeDetails','marketingStatus','rentalAvailability')) then return false; end if;
 if jsonb_typeof(f->'core') is distinct from 'object' or jsonb_typeof(f->'activeOffer') is distinct from 'object' or jsonb_typeof(f->'typeDetails') is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(f->'core') e(k) where e.k not in ('id','propertyType','locationArea')) then return false; end if;
 if jsonb_typeof(f#>'{core,id}') is distinct from 'string' then return false; end if;
 if f#>>'{core,id}' is distinct from p_source or f#>>'{core,propertyType}' is distinct from 'apartment' then return false; end if;
 if jsonb_typeof(f#>'{core,locationArea}') is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(f#>'{core,locationArea}') e(k) where e.k<>'id') then return false; end if;
 if jsonb_typeof(f#>'{core,locationArea,id}') is distinct from 'string' then return false; end if;
 if coalesce(f#>>'{core,locationArea,id}','') !~ '^[a-z][a-z0-9_]{0,63}$' then return false; end if;
 if exists(select 1 from jsonb_object_keys(f->'activeOffer') e(k) where e.k not in ('id','propertyCoreId','transaction','rentalPrice','rentalPeriodId')) then return false; end if;
 if f#>>'{activeOffer,propertyCoreId}' is distinct from p_source or f#>>'{activeOffer,transaction}' is distinct from 'rent' then return false; end if;
 if coalesce(f#>>'{activeOffer,id}','') !~ '^[A-Za-z0-9_-]{1,128}$' then return false; end if;
 if coalesce(f#>>'{activeOffer,rentalPeriodId}','') not in ('daily','monthly','yearly') then return false; end if;
 if jsonb_typeof(f#>'{activeOffer,rentalPrice}') is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(f#>'{activeOffer,rentalPrice}') e(k) where e.k not in ('amount','currencyCode')) then return false; end if;
 if f#>>'{activeOffer,rentalPrice,currencyCode}' is distinct from 'KWD' or jsonb_typeof(f#>'{activeOffer,rentalPrice,amount}') is distinct from 'number' then return false; end if;
 n:=(f#>>'{activeOffer,rentalPrice,amount}')::numeric;
 if n<=0 or n>10000000 then return false; end if;
 if f ? 'marketingStatus' and coalesce(f->>'marketingStatus','') not in ('active','paused') then return false; end if;
 if f ? 'rentalAvailability' and coalesce(f->>'rentalAvailability','') not in ('available','rented') then return false; end if;
 if f#>>'{typeDetails,propertyType}' is distinct from 'apartment' then return false; end if;
 for k,v in select * from jsonb_each(f->'typeDetails') loop
  if k='propertyType' then continue;
  elsif k='apartmentSubtype' then if coalesce(v#>>'{}','') not in ('studio','standard_apartment','duplex') then return false; end if;
  elsif k='furnishing' then if coalesce(v#>>'{}','') not in ('furnished','semi_furnished','unfurnished') then return false; end if;
  elsif k in ('bedroomCount','bathroomCount','masterBedroomCount','studioRoomCount','parkingSpaceCount') then
   if jsonb_typeof(v)<>'number' then return false; end if;
   n:=(v#>>'{}')::numeric; if n<0 or n>100 or n<>trunc(n) then return false; end if;
  elsif k in ('hasCentralAC','hasElevator','hasSecurityGuard','hasBalcony','hasMaidRoom','hasPool','hasGym') then if jsonb_typeof(v)<>'boolean' then return false; end if;
  else return false;
  end if;
 end loop;
 return true;
exception when others then return false;
end $$;

create function public.vs_circle_publish(p_circle uuid,p_source text,p_expected bigint,p_operation uuid,p_facts jsonb,p_withdraw boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid; previous viewstate_circle.properties; next_id uuid; next_revision bigint; fingerprint text;
begin
 -- Lock also serializes membership revocation against publication.
 perform 1 from viewstate_circle.circles where id=p_circle for update;
 who:=viewstate_circle.require_member(p_circle);
 if p_source is null or length(p_source) not between 1 and 128 or p_expected is null or p_expected<0 or p_operation is null or p_withdraw is null then raise exception 'CIRCLE_INPUT_INVALID' using errcode='22023'; end if;
 if not p_withdraw and not viewstate_circle.valid_facts(p_facts,p_source) then raise exception 'CIRCLE_FACTS_INVALID' using errcode='22023'; end if;
 fingerprint:=md5(jsonb_build_array(p_withdraw,case when p_withdraw then null else p_facts end)::text);
 select * into previous from viewstate_circle.properties where circle_id=p_circle and publisher_id=who and source_key=p_source;
 if found and previous.last_operation=p_operation then
  if previous.operation_hash<>fingerprint then raise exception 'CIRCLE_OPERATION_REUSED' using errcode='22023'; end if;
  return jsonb_build_object('id',previous.id,'revision',previous.revision,'state',previous.state);
 end if;
 if coalesce(previous.revision,0)<>p_expected then raise exception 'CIRCLE_REVISION_CONFLICT' using errcode='40001'; end if;
 next_id:=coalesce(previous.id,gen_random_uuid()); next_revision:=p_expected+1;
 insert into viewstate_circle.properties(id,circle_id,publisher_id,source_key,revision,state,facts,last_operation,operation_hash)
 values(next_id,p_circle,who,p_source,next_revision,case when p_withdraw then 'withdrawn' else 'published' end,case when p_withdraw then '{}'::jsonb else p_facts end,p_operation,fingerprint)
 on conflict(circle_id,publisher_id,source_key) do update set revision=excluded.revision,state=excluded.state,facts=excluded.facts,last_operation=excluded.last_operation,operation_hash=excluded.operation_hash,updated_at=now();
 perform viewstate_circle.bump(p_circle);
 return jsonb_build_object('id',next_id,'revision',next_revision,'state',case when p_withdraw then 'withdrawn' else 'published' end);
end $$;

create function public.vs_circle_catalog(p_circle uuid) returns table(id uuid,publisher_id uuid,source_key text,revision bigint,facts jsonb)
language plpgsql stable security invoker set search_path='' as $$
begin
 perform viewstate_circle.require_member(p_circle);
 return query select p.id,p.publisher_id,p.source_key,p.revision,p.facts from viewstate_circle.properties p where p.circle_id=p_circle order by p.id;
end $$;
create function public.vs_circle_list() returns table(id uuid,name text,owner_id uuid,revision bigint)
language sql stable security invoker set search_path='' as $$ select c.id,c.name,c.owner_id,c.revision from viewstate_circle.circles c order by c.created_at,c.id $$;
create function public.vs_circle_invitations() returns table(circle_id uuid,state text)
language sql stable security invoker set search_path='' as $$ select m.circle_id,m.state from viewstate_circle.members m where m.user_id=viewstate_circle.actor() and m.state='invited' $$;

-- No default PUBLIC function execution, including internal definer helpers.
revoke all on all functions in schema viewstate_circle from public,anon,authenticated;
grant execute on function viewstate_circle.actor(),viewstate_circle.is_member(uuid),viewstate_circle.publisher_active(uuid,uuid),viewstate_circle.require_member(uuid) to authenticated;
revoke all on function public.vs_circle_create(uuid,text),public.vs_circle_member(uuid,uuid,text),public.vs_circle_accept(uuid),public.vs_circle_publish(uuid,text,bigint,uuid,jsonb,boolean),public.vs_circle_catalog(uuid),public.vs_circle_list(),public.vs_circle_invitations() from public,anon;
grant execute on function public.vs_circle_create(uuid,text),public.vs_circle_member(uuid,uuid,text),public.vs_circle_accept(uuid),public.vs_circle_publish(uuid,text,bigint,uuid,jsonb,boolean),public.vs_circle_catalog(uuid),public.vs_circle_list(),public.vs_circle_invitations() to authenticated;
