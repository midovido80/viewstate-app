create function viewstate_circle.on_workspace_property_refresh() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  circle uuid;
  publication record;
  source jsonb;
  projection jsonb;
  previous jsonb;
  changed boolean;
begin
  previous := case when tg_op='UPDATE' then old.payload->'records' else '{}'::jsonb end;
  for circle in
    select distinct p.circle_id from viewstate_circle.properties p
    where p.publisher_id=new.user_id and p.state='published' and not p.source_deleted
    order by p.circle_id
  loop
    perform 1 from viewstate_circle.circles where id=circle for update;
    changed := false;
    for publication in
      select p.* from viewstate_circle.properties p
      where p.circle_id=circle and p.publisher_id=new.user_id
        and p.state='published' and not p.source_deleted
    loop
      source := new.payload->'records'->('property/' || publication.source_key);
      projection := new.payload->'circlePropertyFacts'->publication.source_key;
      if source is null or source->'deleted'='true'::jsonb then continue; end if;
      if projection is null and source is not distinct from previous->('property/' || publication.source_key) then
        continue;
      end if;
      if not coalesce(viewstate_circle.valid_facts(projection,publication.source_key),false)
        or source#>>'{core,id}' is distinct from publication.source_key
        or source#>>'{core,propertyType}' is distinct from projection#>>'{core,propertyType}'
        or source#>'{core,locationArea,id}' is distinct from projection#>'{core,locationArea,id}'
        or (select jsonb_object_agg(key,value) from jsonb_each(case when jsonb_typeof(source->'activeOffer')='object'
          then source->'activeOffer' else '{}'::jsonb end)
          where key=any(array['id','propertyCoreId','transaction','rentalPrice','rentalPeriodId','salePrice']))
          is distinct from projection->'activeOffer'
        or coalesce(source->>'marketingStatus','active') is distinct from coalesce(projection->>'marketingStatus','active')
        or coalesce(source->>'rentalAvailability','available') is distinct from coalesce(projection->>'rentalAvailability','available') then
        update viewstate_circle.properties set state='withdrawn', facts='{}'::jsonb,
          revision=revision+1, updated_at=now() where id=publication.id;
        changed := true;
      elsif publication.facts is distinct from projection then
        update viewstate_circle.properties set facts=projection,
          revision=revision+1, updated_at=now() where id=publication.id;
        changed := true;
      end if;
    end loop;
    if changed then perform viewstate_circle.bump(circle); end if;
  end loop;
  return new;
end $$;

revoke all on function viewstate_circle.on_workspace_property_refresh() from public,anon,authenticated;

-- Lifecycle withdrawal runs first; refreshing facts cannot revive a withdrawn share.
create trigger circle_workspace_property_refresh
after insert or update of payload on public.account_workspaces
for each row execute function viewstate_circle.on_workspace_property_refresh();
