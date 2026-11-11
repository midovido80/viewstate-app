create or replace function viewstate_circle.valid_facts(f jsonb,p_source text) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; n numeric;
begin
 if f is null or jsonb_typeof(f)<>'object' or pg_column_size(f)>16384 then return false; end if;
 if exists(select 1 from jsonb_object_keys(f) e(k) where e.k not in ('core','activeOffer','typeDetails','marketingStatus','rentalAvailability')) then return false; end if;
 if jsonb_typeof(f->'core') is distinct from 'object' or jsonb_typeof(f->'activeOffer') is distinct from 'object' or jsonb_typeof(f->'typeDetails') is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(f->'core') e(k) where e.k not in ('id','propertyType','locationArea')) then return false; end if;
 if jsonb_typeof(f#>'{core,id}') is distinct from 'string' then return false; end if;
 if coalesce(p_source,'') !~ '[^[:space:]]' or f#>>'{core,id}' is distinct from p_source or f#>>'{core,propertyType}' is distinct from 'apartment' then return false; end if;
 if jsonb_typeof(f#>'{core,locationArea}') is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(f#>'{core,locationArea}') e(k) where e.k<>'id') then return false; end if;
 if jsonb_typeof(f#>'{core,locationArea,id}') is distinct from 'string' then return false; end if;
 if coalesce(f#>>'{core,locationArea,id}','') !~ '^[a-z][a-z0-9_]{0,63}$' then return false; end if;
 if exists(select 1 from jsonb_object_keys(f->'activeOffer') e(k) where e.k not in ('id','propertyCoreId','transaction','rentalPrice','rentalPeriodId')) then return false; end if;
 if f#>>'{activeOffer,propertyCoreId}' is distinct from p_source or f#>>'{activeOffer,transaction}' is distinct from 'rent' then return false; end if;
 if jsonb_typeof(f#>'{activeOffer,id}') is distinct from 'string' or coalesce(f#>>'{activeOffer,id}','') !~ '^[A-Za-z0-9_-]{1,128}$' then return false; end if;
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
  elsif k in ('hasCentralAC','hasElevator','hasSecurityGuard','hasBalcony','hasMaidRoom') then if jsonb_typeof(v)<>'boolean' then return false; end if;
  else return false;
  end if;
 end loop;
 if f->'typeDetails' ? 'studioRoomCount' and (
   f#>>'{typeDetails,apartmentSubtype}' is distinct from 'studio'
   or (f#>>'{typeDetails,studioRoomCount}')::numeric <> 1
 ) then return false; end if;
 if f->'typeDetails' ? 'masterBedroomCount' and (
   f#>>'{typeDetails,apartmentSubtype}' = 'studio'
   or (f#>>'{typeDetails,masterBedroomCount}')::numeric >
      (f#>>'{typeDetails,bedroomCount}')::numeric
 ) then return false; end if;
 return true;
exception when others then return false;
end $$;

alter table viewstate_circle.properties add column source_deleted boolean not null default false;

-- Keep the original revision and idempotency checks behind the public RPC.
alter function public.vs_circle_publish(uuid,text,bigint,uuid,jsonb,boolean) set schema viewstate_circle;
revoke all on function viewstate_circle.vs_circle_publish(uuid,text,bigint,uuid,jsonb,boolean) from public, anon, authenticated;

create function public.vs_circle_publish(
  p_circle uuid, p_source text, p_expected bigint, p_operation uuid,
  p_facts jsonb, p_withdraw boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  publisher uuid := viewstate_circle.actor();
  source jsonb;
begin
  -- Same owner lock and lock order as commit_account_workspace.
  perform pg_advisory_xact_lock(hashtextextended(publisher::text, 0));
  perform viewstate_circle.require_member(p_circle);

  if p_withdraw is false then
    select payload->'records'->('property/' || p_source) into source
      from public.account_workspaces where user_id=publisher;
    if source->'deleted' = 'true'::jsonb or exists (
      select 1 from viewstate_circle.properties p
      where p.publisher_id=publisher and p.source_key=p_source and p.source_deleted
    ) then
      raise exception 'CIRCLE_SOURCE_DELETED' using errcode='22023';
    end if;
    if source is not null and (
      coalesce(source->>'marketingStatus','active') is distinct from coalesce(p_facts->>'marketingStatus','active')
      or coalesce(source->>'rentalAvailability','available') is distinct from coalesce(p_facts->>'rentalAvailability','available')
    ) then
      raise exception 'CIRCLE_SOURCE_STATUS_CONFLICT' using errcode='40001';
    end if;
  end if;
  return viewstate_circle.vs_circle_publish(p_circle,p_source,p_expected,p_operation,p_facts,p_withdraw);
end $$;
revoke all on function public.vs_circle_publish(uuid,text,bigint,uuid,jsonb,boolean) from public, anon;
grant execute on function public.vs_circle_publish(uuid,text,bigint,uuid,jsonb,boolean) to authenticated;

-- Synchronize only lifecycle facts for explicit publications by this account.
create function viewstate_circle.reconcile_workspace_lifecycle(
  p_owner uuid, p_old jsonb, p_new jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  circle uuid;
  changed integer;
begin
  for circle in
    select distinct p.circle_id from viewstate_circle.properties p
    where p.publisher_id=p_owner and not p.source_deleted
    order by p.circle_id
  loop
    perform 1 from viewstate_circle.circles where id=circle for update;
    with source as (
      select p.id, p.state, p.facts, p_new->('property/' || p.source_key) as record,
        p_old ? ('property/' || p.source_key) and not (p_new ? ('property/' || p.source_key)) as removed
      from viewstate_circle.properties p
      where p.circle_id=circle and p.publisher_id=p_owner and not p.source_deleted
    ), lifecycle as (
      select id, state, facts,
        coalesce(removed or record->'deleted'='true'::jsonb, false) as deleted,
        case when record->>'marketingStatus' in ('active','paused','sold')
          then record->>'marketingStatus' else 'active' end as marketing,
        case when record->>'rentalAvailability'='rented'
          then 'rented' else 'available' end as availability,
        record is not null as synced
      from source
    )
    update viewstate_circle.properties p
    set state=case when l.deleted or l.marketing='sold' then 'withdrawn' else l.state end,
        source_deleted=l.deleted,
        facts=case when l.deleted or l.marketing='sold' then '{}'::jsonb
          else l.facts || jsonb_build_object('marketingStatus',l.marketing,'rentalAvailability',l.availability) end,
        revision=p.revision+1, updated_at=now()
    from lifecycle l
    where p.id=l.id and (
      l.deleted or (l.synced and l.state='published' and (
        coalesce(l.facts->>'marketingStatus','active') is distinct from l.marketing
        or coalesce(l.facts->>'rentalAvailability','available') is distinct from l.availability
      ))
    );
    get diagnostics changed = row_count;
    if changed>0 then perform viewstate_circle.bump(circle); end if;
  end loop;
end $$;

create function viewstate_circle.on_workspace_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform viewstate_circle.reconcile_workspace_lifecycle(
    new.user_id,
    case when tg_op='UPDATE' then old.payload->'records' else '{}'::jsonb end,
    new.payload->'records'
  );
  return new;
end $$;
revoke all on function viewstate_circle.reconcile_workspace_lifecycle(uuid,jsonb,jsonb),
  viewstate_circle.on_workspace_lifecycle() from public, anon, authenticated;
create trigger circle_workspace_lifecycle
after insert or update of payload on public.account_workspaces
for each row execute function viewstate_circle.on_workspace_lifecycle();

create or replace function public.vs_circle_catalog(p_circle uuid)
returns table(id uuid,publisher_id uuid,source_key text,revision bigint,facts jsonb)
language plpgsql stable security invoker set search_path='' as $$
begin
  perform viewstate_circle.require_member(p_circle);
  return query select p.id,p.publisher_id,p.source_key,p.revision,p.facts
    from viewstate_circle.properties p where p.circle_id=p_circle
      and viewstate_circle.valid_facts(p.facts,p.source_key)
    order by p.id;
end $$;
grant execute on function viewstate_circle.valid_facts(jsonb,text) to authenticated;

create function public.vs_circle_decline(p_circle uuid) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor();
begin
  perform 1 from viewstate_circle.circles where id=p_circle for update;
  update viewstate_circle.members set state='revoked', generation=generation+1
    where circle_id=p_circle and user_id=who and state='invited';
  if not found then raise exception 'CIRCLE_INVITATION_REQUIRED' using errcode='42501'; end if;
end $$;
revoke all on function public.vs_circle_decline(uuid) from public, anon;
grant execute on function public.vs_circle_decline(uuid) to authenticated;

-- Reconcile already-synchronized deletions and availability on existing publications.
do $$
declare owner uuid; records jsonb;
begin
  for owner in select distinct publisher_id from viewstate_circle.properties order by publisher_id loop
    perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
    select payload->'records' into records from public.account_workspaces where user_id=owner;
    if records is not null then
      perform viewstate_circle.reconcile_workspace_lifecycle(owner,'{}'::jsonb,records);
    end if;
  end loop;
end $$;
