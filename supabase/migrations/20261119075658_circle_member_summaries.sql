create function public.vs_circle_members(p_circle uuid)
returns table(user_id uuid, display_name text, company text, state text, is_owner boolean)
language plpgsql stable security definer set search_path='' as $$
declare who uuid := viewstate_circle.require_member(p_circle);
declare circle_owner uuid;
begin
  select c.owner_id into circle_owner from viewstate_circle.circles c where c.id=p_circle;
  return query
    select m.user_id, coalesce(nullif(p.display_name,''),''), coalesce(p.company,''), m.state, m.user_id=circle_owner
    from viewstate_circle.members m
    left join public.user_profiles p on p.user_id=m.user_id
    where m.circle_id=p_circle and (m.state='active' or (who=circle_owner and m.state='invited'))
    order by (m.user_id=circle_owner) desc, p.display_name nulls last, m.user_id;
end $$;
revoke all on function public.vs_circle_members(uuid) from public,anon;
grant execute on function public.vs_circle_members(uuid) to authenticated;
