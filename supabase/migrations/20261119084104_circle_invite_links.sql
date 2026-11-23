create table viewstate_circle.invite_links (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 circle_id uuid not null references viewstate_circle.circles(id) on delete cascade,
 inviter uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 used_by uuid references auth.users(id) on delete set null,
 used_at timestamptz
);
alter table viewstate_circle.invite_links enable row level security;
revoke all on viewstate_circle.invite_links from public,anon,authenticated;
create index circle_invite_created on viewstate_circle.invite_links(circle_id,created_at);

create function public.vs_circle_invite_link(p_circle uuid,p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.require_member(p_circle); existing viewstate_circle.invite_links;
begin
 perform 1 from viewstate_circle.circles where id=p_circle and owner_id=who for update;
 if not found then raise exception 'CIRCLE_OWNER_REQUIRED' using errcode='42501'; end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'CIRCLE_INVITE_INVALID' using errcode='22023'; end if;
 select * into existing from viewstate_circle.invite_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if found then
   if existing.inviter=who and existing.circle_id=p_circle and existing.expires_at>now() and existing.used_at is null then return; end if;
   raise exception 'CIRCLE_INVITE_INVALID' using errcode='22023';
 end if;
 if (select count(*) from viewstate_circle.invite_links where circle_id=p_circle and created_at>now()-interval '1 day')>=100 then
   raise exception 'CIRCLE_INVITE_LIMIT' using errcode='22023';
 end if;
 insert into viewstate_circle.invite_links(token_hash,circle_id,inviter)
 values(encode(sha256(convert_to(p_token,'UTF8')),'hex'),p_circle,who);
end $$;

create function public.vs_circle_invite_preview(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor(); result jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select jsonb_build_object('circleId',c.id,'circleName',c.name,'inviterName',coalesce(nullif(p.display_name,''),'زميل في ViewState'),'expiresAt',l.expires_at,'alreadyMember',viewstate_circle.is_member(c.id))
 into result from viewstate_circle.invite_links l
 join viewstate_circle.circles c on c.id=l.circle_id and c.owner_id=l.inviter
 left join public.user_profiles p on p.user_id=l.inviter
 where l.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and l.expires_at>now()
   and (l.used_at is null or l.used_by=who) and viewstate_circle.publisher_active(c.id,l.inviter);
 return result;
end $$;

create function public.vs_circle_invite_accept(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor(); link viewstate_circle.invite_links; member_state text;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'CIRCLE_INVITE_UNAVAILABLE' using errcode='22023'; end if;
 select * into link from viewstate_circle.invite_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then raise exception 'CIRCLE_INVITE_UNAVAILABLE' using errcode='22023'; end if;
 perform 1 from viewstate_circle.circles where id=link.circle_id and owner_id=link.inviter for update;
 if not found or not viewstate_circle.publisher_active(link.circle_id,link.inviter) then raise exception 'CIRCLE_INVITE_UNAVAILABLE' using errcode='42501'; end if;
 select * into link from viewstate_circle.invite_links where token_hash=link.token_hash for update;
 if link.used_by=who and viewstate_circle.is_member(link.circle_id) then return link.circle_id; end if;
 if link.expires_at<=now() or link.used_at is not null or link.inviter=who then raise exception 'CIRCLE_INVITE_UNAVAILABLE' using errcode='22023'; end if;
 select state into member_state from viewstate_circle.members where circle_id=link.circle_id and user_id=who;
 if member_state='revoked' then raise exception 'CIRCLE_INVITE_UNAVAILABLE' using errcode='42501'; end if;
 if member_state is distinct from 'active' then
  insert into viewstate_circle.members(circle_id,user_id,state) values(link.circle_id,who,'invited') on conflict(circle_id,user_id) do nothing;
  perform public.vs_circle_accept(link.circle_id);
 end if;
 update viewstate_circle.invite_links set used_by=who,used_at=now() where token_hash=link.token_hash;
 return link.circle_id;
end $$;

create table viewstate_circle.invite_phone_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null,
 attempts integer not null
);
alter table viewstate_circle.invite_phone_limits enable row level security;
revoke all on viewstate_circle.invite_phone_limits from public,anon,authenticated;
create function public.vs_circle_invite_phone(p_circle uuid,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.require_member(p_circle); recipient uuid; tries integer; member_state text;
begin
 perform 1 from viewstate_circle.circles where id=p_circle and owner_id=who for update;
 if not found then raise exception 'CIRCLE_OWNER_REQUIRED' using errcode='42501'; end if;
 insert into viewstate_circle.invite_phone_limits as lim(user_id,window_start,attempts) values(who,now(),1)
 on conflict(user_id) do update set window_start=case when lim.window_start<now()-interval '1 hour' then now() else lim.window_start end,
 attempts=case when lim.window_start<now()-interval '1 hour' then 1 else lim.attempts+1 end
 returning lim.attempts into tries;
 if tries>30 then return jsonb_build_object('status','rate_limited'); end if;
 if p_phone is null or p_phone !~ '^\+[1-9][0-9]{6,14}$' then return jsonb_build_object('status','unavailable'); end if;
 select id into recipient from auth.users where phone_confirmed_at is not null
   and '+'||regexp_replace(phone,'[^0-9]','','g')=p_phone and is_anonymous is not true and id<>who;
 if recipient is null then return jsonb_build_object('status','unavailable'); end if;
 select state into member_state from viewstate_circle.members where circle_id=p_circle and user_id=recipient;
 if member_state='active' then return jsonb_build_object('status','already_member'); end if;
 perform public.vs_circle_member(p_circle,recipient,'invite');
 return jsonb_build_object('status',case when member_state='invited' then 'pending' else 'sent' end);
end $$;

create function public.vs_circle_invitations_named() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid:=viewstate_circle.actor();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('circle_id',c.id,'circle_name',c.name,'inviter_name',coalesce(nullif(p.display_name,''),'زميل في ViewState')))
 from viewstate_circle.members m join viewstate_circle.circles c on c.id=m.circle_id
 left join public.user_profiles p on p.user_id=c.owner_id
 where m.user_id=who and m.state='invited' and viewstate_circle.publisher_active(c.id,c.owner_id)),'[]'::jsonb);
end $$;
revoke all on function public.vs_circle_invite_link(uuid,text),public.vs_circle_invite_preview(text),public.vs_circle_invite_accept(text),public.vs_circle_invite_phone(uuid,text),public.vs_circle_invitations_named() from public,anon;
grant execute on function public.vs_circle_invite_link(uuid,text),public.vs_circle_invite_preview(text),public.vs_circle_invite_accept(text),public.vs_circle_invite_phone(uuid,text),public.vs_circle_invitations_named() to authenticated;

create function public.vs_circle_matching_pause(p_circle uuid) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.require_member(p_circle);
begin
 perform 1 from viewstate_circle.circles where id=p_circle for update;
 delete from viewstate_circle.requests where circle_id=p_circle and owner_id=who;
 if found then perform viewstate_circle.bump(p_circle); end if;
end $$;
revoke all on function public.vs_circle_matching_pause(uuid) from public,anon;
grant execute on function public.vs_circle_matching_pause(uuid) to authenticated;
