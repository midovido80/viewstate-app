-- Additive request publication parity with the shared property-domain matcher.
-- The worker imports the domain evaluator; floor membership and count tolerance
-- therefore use the same implementation as local matches. RPCs and grants stay intact.
create or replace function viewstate_circle.valid_request_facts(f jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare
 k text; v jsonb; item jsonb;
 kind text := f->>'propertyType';
 purpose text := f->>'purpose';
 budget jsonb := f->'budget';
 allowed text[];
begin
 if jsonb_typeof(f) is distinct from 'object' or pg_column_size(f)>16384
  or coalesce(kind,'') not in ('whole_building','commercial_complex','apartment','floor','house','villa','office','shop','warehouse','chalet','other_built_property')
  or coalesce(purpose,'') not in ('rent','buy') or (purpose='rent' and kind='commercial_complex')
  or f->'notes' is distinct from '""'::jsonb
  or not viewstate_circle.valid_circle_ids(f->'preferredAreaIds')
  or f->>'preferredAreaMode' is distinct from (case when jsonb_array_length(f->'preferredAreaIds')=0 then 'all_kuwait' else 'specific_areas' end)
  or jsonb_typeof(budget) is distinct from 'object' or budget->>'currencyCode' is distinct from 'KWD'
  or budget - array['currencyCode','minimum','maximum'] <> '{}'::jsonb
  or (budget ? 'minimum' and not viewstate_circle.valid_circle_number(budget->'minimum',false,0))
  or (budget ? 'maximum' and not viewstate_circle.valid_circle_number(budget->'maximum',false,0))
  or (budget->>'minimum')::numeric > (budget->>'maximum')::numeric
  or (not budget ?| array['minimum','maximum'] and not coalesce(f->'unspecifiedFields' ? 'budget',false))
  or (budget ?| array['minimum','maximum'] and coalesce(f->'unspecifiedFields' ? 'budget',false))
  or (f ? 'bedroomsMinimum' and coalesce(f->'unspecifiedFields' ? 'bedrooms',false))
  or (f ? 'bathroomsMinimum' and coalesce(f->'unspecifiedFields' ? 'bathrooms',false))
  or (purpose='buy' and f ?| array['rentalPeriodId','occupancy','swimmingPool','gym','seaView'])
  or (f ? 'floorUse' and (kind<>'floor' or coalesce(f->>'floorUse','') not in ('residential','commercial')))
  or (f ? 'propertyUse' and (kind<>'other_built_property' or coalesce(f->>'propertyUse','') not in ('residential','commercial'))) then
   return false;
 end if;
 for k,v in select * from jsonb_each(f - array['purpose','propertyType','preferredAreaIds','preferredAreaMode','budget','notes','floorUse','propertyUse']) loop
  if k in ('bedroomsMinimum','bathroomsMinimum','masterBedroomsMinimum') then
   if not viewstate_circle.valid_circle_number(v,true,0) then return false; end if;
  elsif k in ('driverRoom','centralAC','swimmingPool','gym','seaView') then
   if jsonb_typeof(v)<>'boolean' then return false; end if;
  elsif k='rentalPeriodId' then
   if (v#>>'{}') not in ('daily','monthly','yearly') or jsonb_typeof(v)<>'string' then return false; end if;
  elsif k='occupancy' then
   if (v#>>'{}') not in ('family','bachelor','company_staff','women','mixed','any') or jsonb_typeof(v)<>'string' then return false; end if;
  elsif k in ('preferredNearbyServices','unspecifiedFields','preferredAmenities','preferredAmenityExclusions') then
   if not viewstate_circle.valid_circle_ids(v) then return false; end if;
   allowed := case k
    when 'unspecifiedFields' then array['budget','bedrooms','bathrooms','area']
    when 'preferredNearbyServices' then array['supermarket','school','hospital','mosque','restaurant','bus_station','bank_atm','pharmacy','club_gym','beach','cafe','laundry','clinic','nursery','park','shopping_center','other']
    else array['heating','balcony','maid_room','laundry_room','solar_heater','elevator','garden','security_guard','bbq_area','private_roof'] end;
   if allowed is not null and exists(select 1 from jsonb_array_elements_text(v) value where not value=any(allowed)) then return false; end if;
  elsif k='commercialActivity' then
   if jsonb_typeof(v)<>'string' or (v#>>'{}') not in ('retail','office','restaurant','clinic','warehouse') then return false; end if;
  elsif k='kitchens' then
   if not viewstate_circle.valid_circle_kitchens(v) then return false; end if;
  elsif k='commercialServices' then
   if jsonb_typeof(v)<>'object'
    or exists(
      select 1 from jsonb_each(v) e(key,value)
      where not case key
       when 'automaticNumberCount' then viewstate_circle.valid_circle_number(value,true,0)
       when 'bathrooms' then (value#>>'{}') in ('private','shared') and jsonb_typeof(value)='string'
       when 'kitchen' then (value#>>'{}') in ('private','shared') and jsonb_typeof(value)='string'
       when 'parkingTypes' then viewstate_circle.valid_circle_ids(value) and value <@ '["private","public","paid"]'::jsonb
       else key in ('cleaning','security','cameras','elevators') and jsonb_typeof(value)='boolean'
      end
    ) then return false; end if;
  elsif k='catalogPreferences' then
   if jsonb_typeof(v)<>'array' then return false; end if;
   for item in select value from jsonb_array_elements(v) loop
    if jsonb_typeof(item)<>'object' or item - array['kind','field','comparison','value'] <> '{}'::jsonb then return false; end if;

    -- New preferences use the same type applicability as the physical domain.
    if not coalesce(case item->>'field'
      when 'floorCount' then kind in ('whole_building','commercial_complex','house','villa','chalet')
      when 'unitCount' then kind in ('whole_building','commercial_complex')
      when 'apartmentCount' then kind in ('whole_building','commercial_complex')
      when 'shopCount' then kind in ('whole_building','commercial_complex')
      when 'officeCount' then kind in ('whole_building','commercial_complex')
      when 'roomsPerUnit' then kind in ('whole_building','commercial_complex')
      when 'bathroomsPerUnit' then kind in ('whole_building','commercial_complex')
      when 'entranceCount' then kind in ('warehouse','shop')
      when 'loadingBayCount' then kind='warehouse'
      when 'ceilingHeightMeters' then kind in ('shop','warehouse') or (kind='floor' and f->>'floorUse'='commercial')
      when 'serviceElevatorCapacityTons' then kind='warehouse'
      when 'warehouseKind' then kind='warehouse'
      when 'warehouseLevels' then kind='warehouse'
      when 'hasVehicleRamp' then kind='warehouse'
      when 'hasServiceElevator' then kind='warehouse'
      when 'hasEscalator' then kind in ('warehouse','commercial_complex')
      when 'hasFireSystem' then kind in ('warehouse','whole_building','commercial_complex','office','shop','other_built_property') or (kind='floor' and f->>'floorUse'='commercial')
      else true end,false) then return false; end if;
    if item->>'kind'='number' then
     if not coalesce(item->>'comparison'=case when item->>'field'='floorNumber' then 'exact' else 'minimum' end,false)
      or coalesce(item->>'field','') not in ('plotAreaSquareMeters','builtUpAreaSquareMeters','parkingSpaceCount','livingRoomCount','floorNumber','floorCount','unitCount','apartmentCount','shopCount','officeCount','roomsPerUnit','bathroomsPerUnit','entranceCount','loadingBayCount','ceilingHeightMeters','serviceElevatorCapacityTons')
      or not viewstate_circle.valid_circle_number(item->'value',item->>'field' in ('parkingSpaceCount','livingRoomCount','floorNumber','floorCount','unitCount','apartmentCount','shopCount','officeCount','roomsPerUnit','bathroomsPerUnit','entranceCount','loadingBayCount'),0) then return false; end if;
    elsif item->>'kind'='feature' then
     if item ? 'comparison' or jsonb_typeof(item->'value') is distinct from 'boolean'
      or coalesce(item->>'field','') not in ('hasGuardRoom','hasMaidRoom','hasHeating','hasBalcony','hasLaundryRoom','hasSolarHeater','hasElevator','hasGarden','hasSecurityGuard','hasBBQArea','hasPool','hasWaterfront','hasColdStorage','hasKitchen','hasHall','hasParking','hasSplitAC','hasSharedPool','hasSharedGym','hasSeaView','hasVehicleRamp','hasServiceElevator','hasEscalator','hasFireSystem') then return false; end if;
    elsif item->>'kind'='choice' then
     allowed := case item->>'field'
      when 'warehouseKind' then array['industrial','food']
      when 'warehouseLevels' then array['basement','ground']
      when 'apartmentSubtype' then array['studio','standard_apartment','duplex']
      when 'furnishing' then array['unfurnished','semi_furnished','furnished']
      when 'intendedUse' then array['office','retail','warehouse','residential']
      when 'commercialActivity' then array['retail','office','restaurant','clinic','warehouse']
      end;
     if item ? 'comparison' or allowed is null or not coalesce((item->>'value')=any(allowed),false) then return false; end if;
    else return false;
    end if;
   end loop;
  else return false;
  end if;
 end loop;
 return true;
exception when others then return false;
end $$;
