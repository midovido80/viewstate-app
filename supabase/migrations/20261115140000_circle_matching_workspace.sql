-- Lists only summaries of requests explicitly shared for matching in this circle.
create function public.vs_circle_matching_workspace(p_circle uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare who uuid := viewstate_circle.require_member(p_circle);
begin
  return jsonb_build_object(
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'local_id', case when r.owner_id=who then r.source_key end,
        'type', r.facts->>'propertyType', 'purpose', r.facts->>'purpose'
      ) order by r.id)
      from viewstate_circle.requests r
      where r.circle_id=p_circle and viewstate_circle.publisher_active(p_circle,r.owner_id)
        and viewstate_circle.valid_request_facts(r.facts)
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'request_id', m.request_id, 'property_id', m.property_id, 'score', m.score
      ) order by m.score desc,m.id)
      from viewstate_circle.current_matches m
      where m.circle_id=p_circle and who in (m.requester,m.publisher)
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.vs_circle_matching_workspace(uuid) from public,anon;
grant execute on function public.vs_circle_matching_workspace(uuid) to authenticated;

alter table viewstate_circle.circles add column last_manual_match_at timestamptz;

-- Use the same durable queue as changes to listings and requirements.
create function public.vs_circle_run_matching(p_circle uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform viewstate_circle.require_member(p_circle);
  update viewstate_circle.circles c
  set last_manual_match_at=now()
  where c.id=p_circle
    and (c.last_manual_match_at is null or c.last_manual_match_at < now()-interval '15 seconds')
    and not exists (select 1 from viewstate_circle.change_queue q where q.circle_id=p_circle);
  if found then perform viewstate_circle.bump(p_circle); end if;
end $$;
revoke all on function public.vs_circle_run_matching(uuid) from public,anon;
grant execute on function public.vs_circle_run_matching(uuid) to authenticated;
