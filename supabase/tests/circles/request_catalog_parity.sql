-- Pure validator fixtures; no account, circle, property, request, or notification rows.
begin;
do $$
declare
 base jsonb := '{"purpose":"buy","propertyType":"whole_building","preferredAreaIds":[],"preferredAreaMode":"all_kuwait","budget":{"currencyCode":"KWD","maximum":200000},"notes":""}';
 candidate jsonb; field text; item jsonb;
begin
 foreach field in array array['floorCount','unitCount','apartmentCount','shopCount','officeCount','roomsPerUnit','bathroomsPerUnit'] loop
  item := jsonb_build_object('field',field,'kind','number','comparison','minimum','value',2);
  candidate := base || jsonb_build_object('catalogPreferences',jsonb_build_array(item));
  if not viewstate_circle.valid_request_facts(candidate) then raise exception 'NEW_COUNT_REJECTED: %',field; end if;
  if viewstate_circle.valid_request_facts(candidate || '{"propertyType":"apartment"}') then raise exception 'COUNT_TYPE_SCOPE_LOST: %',field; end if;
  if viewstate_circle.valid_request_facts(base || jsonb_build_object('catalogPreferences',jsonb_build_array(item || '{"comparison":"exact"}'))) then raise exception 'COUNT_RELATION_LOST: %',field; end if;
  if viewstate_circle.valid_request_facts(base || jsonb_build_object('catalogPreferences',jsonb_build_array(item || '{"value":2.5}'))) then raise exception 'FRACTIONAL_COUNT_ACCEPTED: %',field; end if;
 end loop;
 foreach field in array array['ceilingHeightMeters','serviceElevatorCapacityTons','entranceCount','loadingBayCount'] loop
  item := jsonb_build_object('field',field,'kind','number','comparison','minimum','value',case when field in ('entranceCount','loadingBayCount') then 2 else 4.5 end);
  candidate := base || '{"propertyType":"warehouse"}' || jsonb_build_object('catalogPreferences',jsonb_build_array(item));
  if not viewstate_circle.valid_request_facts(candidate) then raise exception 'WAREHOUSE_NUMBER_REJECTED: %',field; end if;
  if viewstate_circle.valid_request_facts(candidate || '{"propertyType":"apartment"}') then raise exception 'WAREHOUSE_NUMBER_TYPE_SCOPE_LOST: %',field; end if;
 end loop;
 foreach field in array array['hasVehicleRamp','hasServiceElevator','hasEscalator','hasFireSystem'] loop
  candidate := base || '{"propertyType":"warehouse"}' || jsonb_build_object('catalogPreferences',jsonb_build_array(jsonb_build_object('field',field,'kind','feature','value',false)));
  if not viewstate_circle.valid_request_facts(candidate) then raise exception 'WAREHOUSE_EQUIPMENT_REJECTED: %',field; end if;
  if viewstate_circle.valid_request_facts(candidate || '{"propertyType":"apartment"}') then raise exception 'EQUIPMENT_TYPE_SCOPE_LOST: %',field; end if;
 end loop;
 foreach item in array array[
  '{"field":"warehouseKind","kind":"choice","value":"industrial"}'::jsonb,
  '{"field":"warehouseKind","kind":"choice","value":"food"}'::jsonb,
  '{"field":"warehouseLevels","kind":"choice","value":"ground"}'::jsonb,
  '{"field":"warehouseLevels","kind":"choice","value":"basement"}'::jsonb
 ] loop
  candidate := base || '{"propertyType":"warehouse"}' || jsonb_build_object('catalogPreferences',jsonb_build_array(item));
  if not viewstate_circle.valid_request_facts(candidate) then raise exception 'WAREHOUSE_CHOICE_REJECTED: %',item; end if;
  if viewstate_circle.valid_request_facts(candidate || '{"propertyType":"office"}') then raise exception 'WAREHOUSE_CHOICE_TYPE_SCOPE_LOST'; end if;
 end loop;
 candidate := base || '{"propertyType":"warehouse","catalogPreferences":[{"field":"warehouseKind","kind":"choice","value":"cooled"}]}';
 if viewstate_circle.valid_request_facts(candidate) then raise exception 'INVENTED_WAREHOUSE_KIND_ACCEPTED'; end if;
 candidate := base || '{"propertyType":"warehouse","catalogPreferences":[{"field":"warehouseLevels","kind":"choice","value":["ground"]}]}';
 if viewstate_circle.valid_request_facts(candidate) then raise exception 'ARRAY_PREFERENCE_ACCEPTED'; end if;
 candidate := base || '{"propertyType":"floor","floorUse":"commercial","catalogPreferences":[{"field":"ceilingHeightMeters","kind":"number","comparison":"minimum","value":4.5}]}';
 if not viewstate_circle.valid_request_facts(candidate) then raise exception 'COMMERCIAL_CEILING_REJECTED'; end if;
 if viewstate_circle.valid_request_facts(candidate || '{"floorUse":"residential"}') then raise exception 'RESIDENTIAL_CEILING_ACCEPTED'; end if;
 candidate := base || '{"propertyType":"office","catalogPreferences":[{"field":"floorNumber","kind":"number","comparison":"exact","value":0}]}';
 if not viewstate_circle.valid_request_facts(candidate) then raise exception 'EXISTING_EXACT_FLOOR_BROKEN'; end if;
 if not viewstate_circle.valid_request_facts(base || '{"catalogPreferences":[{"field":"plotAreaSquareMeters","kind":"number","comparison":"minimum","value":500.5}]}') then raise exception 'EXISTING_PLOT_AREA_BROKEN'; end if;
end $$;
rollback;
