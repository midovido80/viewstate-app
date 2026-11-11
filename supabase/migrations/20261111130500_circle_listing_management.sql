create or replace function viewstate_circle.reconcile_workspace_lifecycle(
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
    set state=case when l.deleted then 'withdrawn' else l.state end,
        source_deleted=l.deleted,
        facts=case when l.deleted then '{}'::jsonb
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

-- Owners can manage their inactive publications. Other members see available inventory only.
drop policy circle_properties_read on viewstate_circle.properties;
create policy circle_properties_read on viewstate_circle.properties for select to authenticated using (
  state='published' and viewstate_circle.is_member(circle_id)
  and viewstate_circle.publisher_active(circle_id,publisher_id)
  and (publisher_id=viewstate_circle.actor() or (
    coalesce(facts->>'marketingStatus','active')='active'
    and coalesce(facts->>'rentalAvailability','available')='available'
  ))
);
