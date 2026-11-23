-- Resolve a notification in the recipient's session before consuming its badge.
create function public.vs_circle_notification_open(p_id uuid) returns jsonb
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
  return jsonb_build_object('kind',route_kind,'circleId',n.circle_id,'targetId',target);
end $$;

revoke all on function public.vs_circle_notification_open(uuid) from public,anon;
grant execute on function public.vs_circle_notification_open(uuid) to authenticated;

create function public.vs_circle_push_notice_ids(p_deliveries uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(d.id,d.notice_id),'{}'::jsonb)
  from viewstate_circle.notification_delivery d
  where d.id=any(p_deliveries)
$$;
revoke all on function public.vs_circle_push_notice_ids(uuid[]) from public,anon,authenticated;
grant execute on function public.vs_circle_push_notice_ids(uuid[]) to service_role;
