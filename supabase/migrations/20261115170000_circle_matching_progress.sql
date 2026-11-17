-- Lists only summaries of requests explicitly shared for matching in this circle.
create or replace function public.vs_circle_matching_workspace(p_circle uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare who uuid := viewstate_circle.require_member(p_circle);
begin
  return jsonb_build_object(
    'processing', exists (
      select 1 from viewstate_circle.change_queue q where q.circle_id=p_circle
    ),
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
