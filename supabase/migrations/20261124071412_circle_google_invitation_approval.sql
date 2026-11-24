alter table viewstate_circle.members add column join_review_required boolean not null default false;
create function viewstate_circle.profile_phone_key(p_phone text) returns text
language plpgsql immutable strict set search_path='' as $$
declare value text:=btrim(translate(p_phone,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789')); digits text;
begin
 digits:=regexp_replace(value,'[^0-9]','','g');
 if value like '00%' then digits:=substr(digits,3);
 elsif value not like '+%' and length(digits)=8 then digits:='965'||digits;
 end if;
 if digits !~ '^[1-9][0-9]{6,14}$' then return null; end if;
 return '+'||digits;
end $$;
revoke all on function viewstate_circle.profile_phone_key(text) from public,anon,authenticated;
grant execute on function viewstate_circle.profile_phone_key(text) to authenticated;
create index circle_profile_phone_hint on public.user_profiles (viewstate_circle.profile_phone_key(phone));

create table viewstate_circle.join_reviews (
 id uuid primary key default gen_random_uuid(),
 circle_id uuid not null references viewstate_circle.circles(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 generation bigint not null,
 identity_id uuid not null,
 google_email text not null,
 display_name text not null,
 requested_at timestamptz not null default now(),
 state text not null default 'pending' check(state in ('pending','approved','declined','cancelled')),
 unique(circle_id,user_id,generation)
);
alter table viewstate_circle.join_reviews enable row level security;
revoke all on viewstate_circle.join_reviews from public,anon,authenticated;

alter table viewstate_circle.notification_inbox drop constraint notification_inbox_kind_check;
alter table viewstate_circle.notification_inbox add constraint notification_inbox_kind_check
 check(kind in ('invite','listing','match','cooperation','test','app_update','join_request'));

-- provider identity data and confirmed Auth email bind consent to the current Google account.
create function viewstate_circle.google_identity(p_user uuid)
returns table(identity_id uuid,google_email text,display_name text)
language plpgsql stable security definer set search_path='' as $$
begin
 return query select i.id,lower(btrim(u.email)),
   left(coalesce(nullif(btrim(i.identity_data->>'full_name'),''),nullif(btrim(i.identity_data->>'name'),''),'مستخدم Google'),150)
 from auth.users u join auth.identities i on i.user_id=u.id and i.provider='google'
 where u.id=p_user and u.is_anonymous is not true and u.email_confirmed_at is not null
   and nullif(btrim(u.email),'') is not null
   and (u.raw_app_meta_data->>'provider'='google' or coalesce(u.raw_app_meta_data->'providers','[]'::jsonb) ? 'google')
   and lower(btrim(i.identity_data->>'email'))=lower(btrim(u.email))
   and i.identity_data->>'email_verified'='true'
 order by i.id limit 1;
end $$;
revoke all on function viewstate_circle.google_identity(uuid) from public,anon,authenticated;

create or replace function public.vs_circle_invite_phone(p_circle uuid,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.require_member(p_circle); recipient uuid; tries integer;
 candidates uuid[]; needs_review boolean:=false;
begin
 perform 1 from viewstate_circle.circles where id=p_circle and owner_id=who for update;
 if not found then raise exception 'CIRCLE_OWNER_REQUIRED' using errcode='42501'; end if;
 insert into viewstate_circle.invite_phone_limits as lim(user_id,window_start,attempts) values(who,now(),1)
 on conflict(user_id) do update set window_start=case when lim.window_start<now()-interval '1 day' then now() else lim.window_start end,
 attempts=case when lim.window_start<now()-interval '1 day' then 1 else least(lim.attempts+1,11) end
 returning lim.attempts into tries;
 if tries>10 then return jsonb_build_object('status','rate_limited'); end if;
 if p_phone is null or p_phone !~ '^\+[1-9][0-9]{6,14}$' then return jsonb_build_object('status','accepted'); end if;
 -- ambiguous profile hints are dropped without disclosing account existence.
 select array_agg(p.user_id) into candidates from (
  select user_id from public.user_profiles
  where viewstate_circle.profile_phone_key(phone)=p_phone limit 2
 ) p;
 if cardinality(candidates)=1 then
  if candidates[1]<>who and exists(select 1 from viewstate_circle.google_identity(candidates[1])) then
   recipient:=candidates[1]; needs_review:=true;
  end if;
 elsif cardinality(candidates)>1 then
  return jsonb_build_object('status','accepted');
 end if;
 if recipient is null then
  select array_agg(u.id) into candidates from (
   select id from auth.users where phone_confirmed_at is not null
    and '+'||regexp_replace(phone,'[^0-9]','','g')=p_phone and is_anonymous is not true and id<>who limit 2
  ) u;
  if cardinality(candidates)=1 then
   recipient:=candidates[1];
   needs_review:=exists(select 1 from viewstate_circle.google_identity(recipient));
  end if;
 end if;
 if recipient is not null then
  insert into viewstate_circle.members(circle_id,user_id,state,private_phone_invite,join_review_required)
   values(p_circle,recipient,'invited',true,needs_review) on conflict(circle_id,user_id) do nothing;
 end if;
 return jsonb_build_object('status','accepted');
end $$;

create function viewstate_circle.cancel_join_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.state<>'invited' or new.generation<>old.generation then
  with cancelled as (
   update viewstate_circle.join_reviews set state='cancelled'
   where circle_id=new.circle_id and user_id=new.user_id and state='pending' returning id
  ) update viewstate_circle.notification_inbox set read_at=coalesce(read_at,now())
    where kind='join_request' and origin in (select id from cancelled);
 end if;
 return new;
end $$;
revoke all on function viewstate_circle.cancel_join_review() from public,anon,authenticated;
create trigger circle_cancel_join_review after update on viewstate_circle.members
 for each row execute function viewstate_circle.cancel_join_review();

create function public.vs_circle_request_join(p_circle uuid) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor(); m viewstate_circle.members; identity record;
 review viewstate_circle.join_reviews; circle_owner uuid;
begin
 select owner_id into circle_owner from viewstate_circle.circles where id=p_circle for update;
 select * into m from viewstate_circle.members where circle_id=p_circle and user_id=who;
 if m.state is distinct from 'invited' or not m.join_review_required
   or not viewstate_circle.publisher_active(p_circle,circle_owner) then
  raise exception 'CIRCLE_INVITATION_REQUIRED' using errcode='42501';
 end if;
 select * into identity from viewstate_circle.google_identity(who);
 if not found then raise exception 'CIRCLE_GOOGLE_IDENTITY_REQUIRED' using errcode='42501'; end if;
 select * into review from viewstate_circle.join_reviews where circle_id=p_circle and user_id=who and generation=m.generation;
 if found then
  if review.state='pending' and review.identity_id=identity.identity_id and review.google_email=identity.google_email then return; end if;
  raise exception 'CIRCLE_JOIN_REVIEW_STALE' using errcode='22023';
 end if;
 insert into viewstate_circle.join_reviews(circle_id,user_id,generation,identity_id,google_email,display_name)
 values(p_circle,who,m.generation,identity.identity_id,identity.google_email,identity.display_name) returning * into review;
 insert into viewstate_circle.notification_inbox(recipient,circle_id,origin,kind,deliver)
 values(circle_owner,p_circle,review.id,'join_request',false);
end $$;

create function public.vs_circle_join_reviews(p_circle uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor();
begin
 if not exists(select 1 from viewstate_circle.circles where id=p_circle and owner_id=who)
  or not viewstate_circle.is_member(p_circle) then raise exception 'CIRCLE_OWNER_REQUIRED' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'display_name',r.display_name,
  'google_email',r.google_email,'requested_at',r.requested_at) order by r.requested_at,r.id)
 from viewstate_circle.join_reviews r join viewstate_circle.members m on m.circle_id=r.circle_id and m.user_id=r.user_id
 where r.circle_id=p_circle and r.state='pending' and m.state='invited' and m.generation=r.generation),'[]'::jsonb);
end $$;

create function public.vs_circle_review_join(p_circle uuid,p_review uuid,p_approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor(); r viewstate_circle.join_reviews; m viewstate_circle.members; identity record;
begin
 perform 1 from viewstate_circle.circles where id=p_circle and owner_id=who for update;
 if not found or not viewstate_circle.is_member(p_circle) then raise exception 'CIRCLE_OWNER_REQUIRED' using errcode='42501'; end if;
 select * into r from viewstate_circle.join_reviews where id=p_review and circle_id=p_circle for update;
 if not found or p_approve is null then raise exception 'CIRCLE_JOIN_REVIEW_STALE' using errcode='22023'; end if;
 select * into m from viewstate_circle.members where circle_id=p_circle and user_id=r.user_id;
 select * into identity from viewstate_circle.google_identity(r.user_id);
 if p_approve and (not found or identity.identity_id is distinct from r.identity_id or identity.google_email is distinct from r.google_email) then
  raise exception 'CIRCLE_JOIN_REVIEW_STALE' using errcode='22023';
 end if;
 if r.state='approved' and p_approve and m.state='active' and m.generation=r.generation then return; end if;
 if r.state='declined' and not p_approve and m.state='revoked' and m.generation=r.generation+1 then return; end if;
 if r.state<>'pending' or m.state is distinct from 'invited' or m.generation is distinct from r.generation or not m.join_review_required then
  raise exception 'CIRCLE_JOIN_REVIEW_STALE' using errcode='22023';
 end if;
 update viewstate_circle.join_reviews set state=case when p_approve then 'approved' else 'declined' end where id=r.id;
 update viewstate_circle.members set state=case when p_approve then 'active' else 'revoked' end,
  generation=generation+case when p_approve then 0 else 1 end where circle_id=p_circle and user_id=r.user_id;
 update viewstate_circle.notification_inbox set read_at=coalesce(read_at,now()) where kind='join_request' and origin=r.id;
 if p_approve then perform viewstate_circle.bump(p_circle); end if;
end $$;

create or replace function public.vs_circle_accept(p_circle uuid) returns void language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor(); m viewstate_circle.members;
begin
 perform 1 from viewstate_circle.circles where id=p_circle for update;
 select * into m from viewstate_circle.members where circle_id=p_circle and user_id=who;
 if m.state='active' then return; end if;
 if m.state is distinct from 'invited' then raise exception 'CIRCLE_INVITATION_REQUIRED' using errcode='42501'; end if;
 if m.join_review_required then raise exception 'CIRCLE_JOIN_REVIEW_REQUIRED' using errcode='42501'; end if;
 update viewstate_circle.members set state='active' where circle_id=p_circle and user_id=who;
 perform viewstate_circle.bump(p_circle);
end $$;

create or replace function public.vs_circle_invitations_named() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('circle_id',c.id,'circle_name',c.name,
  'inviter_name',coalesce(nullif(p.display_name,''),'زميل في ViewState'),'requires_review',m.join_review_required,
  'approval_requested',exists(select 1 from viewstate_circle.join_reviews r where r.circle_id=m.circle_id and r.user_id=who and r.generation=m.generation and r.state='pending')))
 from viewstate_circle.members m join viewstate_circle.circles c on c.id=m.circle_id
 left join public.user_profiles p on p.user_id=c.owner_id
 where m.user_id=who and m.state='invited' and viewstate_circle.publisher_active(c.id,c.owner_id)),'[]'::jsonb);
end $$;

revoke all on function public.vs_circle_request_join(uuid),public.vs_circle_join_reviews(uuid),public.vs_circle_review_join(uuid,uuid,boolean) from public,anon;
grant execute on function public.vs_circle_request_join(uuid),public.vs_circle_join_reviews(uuid),public.vs_circle_review_join(uuid,uuid,boolean) to authenticated;
-- Resolve a notification in the recipient's session before consuming its badge.
create or replace function public.vs_circle_notification_open(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor();
  n viewstate_circle.notification_inbox; target uuid; route_kind text;
begin
  update viewstate_circle.notification_inbox set read_at=coalesce(read_at,now())
  where id=p_id and recipient=who and kind<>'app_update'
  returning * into n;
  if not found then return null; end if;
  if n.kind='test' then return jsonb_build_object('kind','test'); end if;

  if n.kind='invite' and exists (
    select 1 from viewstate_circle.members m
    where m.circle_id=n.circle_id and m.user_id=who and m.state='invited'
  ) then
    return jsonb_build_object('kind','invite','circleId',n.circle_id);
  end if;
  if not viewstate_circle.is_member(n.circle_id) then return null; end if;

  if n.kind='join_request' then
    if exists(select 1 from viewstate_circle.circles c where c.id=n.circle_id and c.owner_id=who) then
      return jsonb_build_object('kind','circle','circleId',n.circle_id);
    end if;
    return null;
  end if;
  if n.kind='invite' then
    return jsonb_build_object('kind','circle','circleId',n.circle_id);
  elsif n.kind='listing' then
    select p.id into target from viewstate_circle.activity_outbox a
    join viewstate_circle.properties p on p.id=a.listing_id and p.circle_id=n.circle_id
    where a.id=n.origin and a.user_id=who and p.state='published' and not p.source_deleted
      and viewstate_circle.publisher_active(n.circle_id,p.publisher_id);
    route_kind:='listing';
  elsif n.kind='match' then
    select case when m.publisher=who then m.id else m.property_id end,
      case when m.publisher=who then 'requirement' else 'listing' end
    into target,route_kind from viewstate_circle.current_matches m
    where m.id=n.origin and m.circle_id=n.circle_id and who in (m.publisher,m.requester);
  elsif n.kind='cooperation' then
    select c.id into target from viewstate_circle.cooperation_outbox o
    join viewstate_circle.cooperations c on c.id=o.cooperation_id and c.circle_id=n.circle_id
    where o.id=n.origin and o.user_id=who and who in (c.publisher_id,c.requester_id);
    route_kind:='cooperation';
  end if;
  if target is null then return null; end if;
  return jsonb_build_object('kind',route_kind,'circleId',n.circle_id,'targetId',target)
    || case when n.kind='match' then jsonb_build_object('matchId',n.origin) else '{}'::jsonb end;
end $$;

revoke all on function public.vs_circle_notification_open(uuid) from public,anon;
grant execute on function public.vs_circle_notification_open(uuid) to authenticated;

create or replace function public.vs_circle_notification_inbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor();
begin
  return jsonb_build_object(
    'unread',(select count(*) from viewstate_circle.notification_inbox where recipient=who and kind not in ('app_update','join_request') and read_at is null),
    'entries',coalesce((
      select jsonb_agg(to_jsonb(item) order by (item.read_at is not null),item.created_at desc,item.id)
      from (
        select id,kind,created_at,read_at from viewstate_circle.notification_inbox
        where recipient=who and kind not in ('app_update','join_request') order by (read_at is not null),created_at desc,id limit 100
      ) item
    ),'[]'::jsonb)
  );
end $$;

create or replace function public.vs_circle_notification_inbox_v2() returns jsonb
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
revoke all on function public.vs_circle_notification_inbox_v2() from public,anon;
grant execute on function public.vs_circle_notification_inbox_v2() to authenticated;
