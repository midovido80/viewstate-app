-- Return the caller's matching status in circles they can currently access.
create function public.vs_circle_requirement_status(p_source uuid)
returns table(id uuid, name text, enabled boolean)
language sql stable security definer set search_path='' as $$
  select c.id, c.name, exists (
    select 1 from viewstate_circle.requests r
    where r.circle_id=c.id and r.owner_id=(select auth.uid()) and r.source_key=p_source
  )
  from viewstate_circle.circles c
  where viewstate_circle.is_member(c.id)
  order by c.created_at,c.id
$$;

revoke all on function public.vs_circle_requirement_status(uuid) from public,anon;
grant execute on function public.vs_circle_requirement_status(uuid) to authenticated;
