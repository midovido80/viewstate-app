create function public.vs_circle_attribution(p_circle uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid := viewstate_circle.require_member(p_circle);
begin
 return jsonb_build_object(
  'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',coalesce(p.display_name,''),'company',coalesce(p.company,''),'phone',coalesce(p.phone,'')))
    from viewstate_circle.members m left join public.user_profiles p on p.user_id=m.user_id
    where m.circle_id=p_circle and m.state='active'
    and (exists(select 1 from viewstate_circle.properties l where l.circle_id=p_circle and l.publisher_id=m.user_id and l.state='published' and not l.source_deleted)
      or exists(select 1 from viewstate_circle.requests r where r.circle_id=p_circle and r.owner_id=m.user_id))), '[]'::jsonb),
  'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'owner_id',r.owner_id)) from viewstate_circle.requests r
    where r.circle_id=p_circle and viewstate_circle.publisher_active(p_circle,r.owner_id)), '[]'::jsonb),
  'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'requester',m.requester,'publisher',m.publisher)) from viewstate_circle.current_matches m
    where m.circle_id=p_circle and who in(m.requester,m.publisher)), '[]'::jsonb));
end $$;
revoke all on function public.vs_circle_attribution(uuid) from public,anon;
grant execute on function public.vs_circle_attribution(uuid) to authenticated;

create function viewstate_circle.notice_member(p_notice uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare n viewstate_circle.notification_inbox; member_id uuid; member_name text;
begin
 select * into n from viewstate_circle.notification_inbox where id=p_notice;
 if not found or not exists(select 1 from viewstate_circle.members where circle_id=n.circle_id and user_id=n.recipient and state='active') then return null; end if;
 if n.kind='listing' then
  select p.publisher_id into member_id from viewstate_circle.activity_outbox a join viewstate_circle.properties p on p.id=a.listing_id and p.circle_id=n.circle_id
   where a.id=n.origin and a.user_id=n.recipient and p.state='published' and not p.source_deleted;
 elsif n.kind='match' then
  select case when m.publisher=n.recipient then m.requester else m.publisher end into member_id
   from viewstate_circle.current_matches m where m.id=n.origin and m.circle_id=n.circle_id and n.recipient in(m.publisher,m.requester);
 elsif n.kind='cooperation' then
  select case when c.sender_id=n.recipient then c.recipient_id else c.sender_id end into member_id
   from viewstate_circle.cooperation_outbox o join viewstate_circle.cooperations c on c.id=o.cooperation_id and c.circle_id=n.circle_id
   where o.id=n.origin and o.user_id=n.recipient and n.recipient in(c.publisher_id,c.requester_id);
 end if;
 if member_id is null or not viewstate_circle.publisher_active(n.circle_id,member_id) then return null; end if;
 select left(regexp_replace(p.display_name,'[[:cntrl:]]',' ','g'),150) into member_name from public.user_profiles p where p.user_id=member_id;
 return nullif(btrim(member_name),'');
end $$;
revoke all on function viewstate_circle.notice_member(uuid) from public,anon,authenticated;

create function public.vs_circle_notification_inbox_v3() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare inbox jsonb := public.vs_circle_notification_inbox_v2();
begin
 return jsonb_set(inbox,'{entries}',coalesce((select jsonb_agg(e.value || jsonb_build_object('member_name',viewstate_circle.notice_member((e.value->>'id')::uuid)) order by e.ordinality)
 from jsonb_array_elements(inbox->'entries') with ordinality e(value,ordinality)), '[]'::jsonb));
end $$;
revoke all on function public.vs_circle_notification_inbox_v3() from public,anon;
grant execute on function public.vs_circle_notification_inbox_v3() to authenticated;

create function public.vs_circle_push_member_names(p_deliveries uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(d.id,viewstate_circle.notice_member(d.notice_id)), '{}'::jsonb)
 from viewstate_circle.notification_delivery d where d.id=any(p_deliveries)
$$;
revoke all on function public.vs_circle_push_member_names(uuid[]) from public,anon,authenticated;
grant execute on function public.vs_circle_push_member_names(uuid[]) to service_role;
