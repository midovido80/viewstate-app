alter table viewstate_circle.members add column private_phone_invite boolean not null default false;

alter policy circle_members_read on viewstate_circle.members to authenticated
 using(user_id=(select auth.uid()) or (viewstate_circle.is_member(circle_id)
   and (not private_phone_invite or state='active')));

create or replace function public.vs_circle_members(p_circle uuid)
returns table(user_id uuid, display_name text, company text, state text, is_owner boolean)
language plpgsql stable security definer set search_path='' as $$
declare who uuid := viewstate_circle.require_member(p_circle); circle_owner uuid;
begin
 select c.owner_id into circle_owner from viewstate_circle.circles c where c.id=p_circle;
 return query select m.user_id,coalesce(nullif(p.display_name,''),''),coalesce(p.company,''),m.state,m.user_id=circle_owner
 from viewstate_circle.members m left join public.user_profiles p on p.user_id=m.user_id
 where m.circle_id=p_circle and (m.state='active' or (who=circle_owner and m.state='invited' and not m.private_phone_invite))
 order by (m.user_id=circle_owner) desc,p.display_name nulls last,m.user_id;
end $$;

create or replace function public.vs_circle_invite_phone(p_circle uuid,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.require_member(p_circle); recipient uuid; tries integer; member_state text;
begin
 perform 1 from viewstate_circle.circles where id=p_circle and owner_id=who for update;
 if not found then raise exception 'CIRCLE_OWNER_REQUIRED' using errcode='42501'; end if;
 insert into viewstate_circle.invite_phone_limits as lim(user_id,window_start,attempts) values(who,now(),1)
 on conflict(user_id) do update set window_start=case when lim.window_start<now()-interval '1 day' then now() else lim.window_start end,
 attempts=case when lim.window_start<now()-interval '1 day' then 1 else least(lim.attempts+1,11) end
 returning lim.attempts into tries;
 if tries>10 then return jsonb_build_object('status','rate_limited'); end if;
 if p_phone is null or p_phone !~ '^\+[1-9][0-9]{6,14}$' then return jsonb_build_object('status','accepted'); end if;
 select id into recipient from auth.users where phone_confirmed_at is not null
   and '+'||regexp_replace(phone,'[^0-9]','','g')=p_phone and is_anonymous is not true and id<>who;
 if recipient is not null then
   select state into member_state from viewstate_circle.members where circle_id=p_circle and user_id=recipient;
   if member_state is null then
    insert into viewstate_circle.members(circle_id,user_id,state,private_phone_invite)
      values(p_circle,recipient,'invited',true);
   end if;
 end if;
 return jsonb_build_object('status','accepted');
end $$;

create or replace function public.vs_circle_request(
 p_circle uuid, p_source uuid, p_facts jsonb, p_withdraw boolean default false
) returns void language plpgsql security definer set search_path='' as $$
declare who uuid;
begin
 perform 1 from viewstate_circle.circles where id=p_circle for update;
 who := viewstate_circle.require_member(p_circle);
 if p_source is null or p_withdraw is null then
  raise exception 'CIRCLE_REQUEST_INVALID' using errcode='22023';
 end if;
 if p_withdraw then
  delete from viewstate_circle.requests where circle_id=p_circle and owner_id=who and source_key=p_source;
  if found then perform viewstate_circle.bump(p_circle); end if;
  return;
 end if;
 if not viewstate_circle.valid_request_facts(p_facts) then
  raise exception 'CIRCLE_REQUEST_INVALID' using errcode='22023';
 end if;
 if not exists(select 1 from viewstate_circle.requests where circle_id=p_circle and owner_id=who and source_key=p_source) then
  if (select count(*) from viewstate_circle.requests where circle_id=p_circle and owner_id=who)>=200 then
   raise exception 'CIRCLE_MEMBER_REQUEST_LIMIT' using errcode='22023';
  end if;
  if (select count(*) from viewstate_circle.requests where circle_id=p_circle)>=2000 then
   raise exception 'CIRCLE_REQUEST_LIMIT' using errcode='22023';
  end if;
 end if;
 insert into viewstate_circle.requests as existing(circle_id,owner_id,source_key,facts)
 values(p_circle,who,p_source,p_facts)
 on conflict(circle_id,owner_id,source_key) do update
   set facts=excluded.facts, revision=existing.revision+1 where existing.facts is distinct from excluded.facts;
 if found then perform viewstate_circle.bump(p_circle); end if;
end $$;

create or replace function public.vs_circle_request(
  p_circle uuid, p_source uuid, p_areas text[], p_max numeric, p_period text,
  p_bedrooms integer, p_bathrooms integer, p_withdraw boolean default false
) returns void language plpgsql security definer set search_path='' as $$
declare next_facts jsonb;
begin
 if p_withdraw is true then
  perform public.vs_circle_request(p_circle,p_source,null::jsonb,true);
  return;
 end if;
 if p_withdraw is null or p_source is null or p_areas is null or cardinality(p_areas)>30
    or exists(select 1 from unnest(p_areas) a where a is null or a !~ '^[a-z][a-z0-9_]{0,63}$')
    or cardinality(p_areas)<>(select count(distinct a) from unnest(p_areas) a)
    or p_max is null or p_max::text in ('NaN','Infinity','-Infinity') or p_max<=0 or p_max>10000000
    or coalesce(p_period,'') not in ('daily','monthly','yearly')
    or p_bedrooms is null or p_bathrooms is null
    or p_bedrooms not between 0 and 100 or p_bathrooms not between 0 and 100 then
  raise exception 'CIRCLE_REQUEST_INVALID' using errcode='22023';
 end if;
 next_facts := jsonb_build_object(
   'purpose','rent','propertyType','apartment','preferredAreaIds',to_jsonb(p_areas),
   'preferredAreaMode',case when cardinality(p_areas)=0 then 'all_kuwait' else 'specific_areas' end,
   'budget',jsonb_build_object('maximum',p_max,'currencyCode','KWD'),
   'rentalPeriodId',p_period,'bedroomsMinimum',p_bedrooms,'bathroomsMinimum',p_bathrooms,'notes',''
 );
 perform public.vs_circle_request(p_circle,p_source,next_facts,false);
end $$;

revoke all on function public.vs_circle_invite_phone(uuid,text),
 public.vs_circle_request(uuid,uuid,jsonb,boolean),
 public.vs_circle_request(uuid,uuid,text[],numeric,text,integer,integer,boolean) from public,anon;
grant execute on function public.vs_circle_invite_phone(uuid,text),
 public.vs_circle_request(uuid,uuid,jsonb,boolean),
 public.vs_circle_request(uuid,uuid,text[],numeric,text,integer,integer,boolean) to authenticated;

create index circle_declined_cooperation_cooldown on viewstate_circle.cooperations
 (circle_id,request_id,property_id,sender_id,updated_at) where status='declined';

create function viewstate_circle.check_cooperation_cooldown() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from viewstate_circle.cooperations c
   where c.circle_id=new.circle_id and c.request_id=new.request_id
     and c.property_id=new.property_id and c.sender_id=new.sender_id
     and c.status='declined' and c.updated_at>now()-interval '24 hours') then
  raise exception 'CIRCLE_COOPERATION_COOLDOWN' using errcode='22023';
 end if;
 return new;
end $$;
revoke all on function viewstate_circle.check_cooperation_cooldown() from public,anon,authenticated;
create trigger circle_cooperation_cooldown before insert on viewstate_circle.cooperations
 for each row execute function viewstate_circle.check_cooperation_cooldown();

create or replace function public.vs_circle_worker_commit(p_circle uuid,p_revision bigint,p_pairs jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
  select revision into current_revision from viewstate_circle.circles where id=p_circle for update;
  if current_revision is null or current_revision is distinct from p_revision then return false; end if;
  if not exists(select 1 from viewstate_circle.change_queue where circle_id=p_circle and revision<=p_revision) then return false; end if;
  if jsonb_typeof(p_pairs) is distinct from 'array' or jsonb_array_length(p_pairs)>10000 then
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
