-- Shared facts are closed by shape before any row can reach the member catalog.
create function viewstate_circle.valid_circle_number(v jsonb, whole boolean, minimum numeric)
returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='number' then
   (v#>>'{}')::numeric between minimum and 9007199254740991
   and (not whole or trunc((v#>>'{}')::numeric)=(v#>>'{}')::numeric)
   else false end
$$;

create function viewstate_circle.valid_circle_ids(v jsonb)
returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='array' then
   jsonb_array_length(v)<=256 and not exists (
     select 1 from jsonb_array_elements(v) e(value)
     where jsonb_typeof(value)<>'string' or (value#>>'{}') !~ '^[a-z][a-z0-9_]{0,63}$'
   ) and (select count(distinct value) from jsonb_array_elements(v) e(value))=jsonb_array_length(v)
   else false end
$$;

create function viewstate_circle.valid_circle_kitchens(v jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare kitchen jsonb; k text; choice jsonb;
begin
 if jsonb_typeof(v) is distinct from 'array' then return false; end if;
 for kitchen in select value from jsonb_array_elements(v) loop
  if jsonb_typeof(kitchen)<>'object' then return false; end if;
  for k,choice in select * from jsonb_each(kitchen) loop
   if jsonb_typeof(choice)<>'string' or not coalesce(case k
    when 'layout' then (choice#>>'{}') in ('regular','american','preparatory')
    when 'equipment' then (choice#>>'{}') in ('equipped','unequipped')
    when 'access' then (choice#>>'{}') in ('private','shared')
    end,false) then return false; end if;
  end loop;
 end loop;
 return true;
end $$;

create or replace function viewstate_circle.valid_facts(f jsonb,p_source text) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; n numeric;
  kind text := f#>>'{core,propertyType}';
  transaction text := f#>>'{activeOffer,transaction}';
  price jsonb;
  details jsonb := f->'typeDetails';
  choices text[];
  child jsonb;
begin
 if f is null or jsonb_typeof(f)<>'object' or pg_column_size(f)>16384 then return false; end if;
 if exists(select 1 from jsonb_object_keys(f) e(k) where e.k not in ('core','activeOffer','typeDetails','marketingStatus','rentalAvailability','areaSquareMeters','areaUnit','nearbyServices')) then return false; end if;
 if jsonb_typeof(f->'core') is distinct from 'object' or jsonb_typeof(f->'activeOffer') is distinct from 'object' or jsonb_typeof(f->'typeDetails') is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(f->'core') e(k) where e.k not in ('id','propertyType','locationArea')) then return false; end if;
 if jsonb_typeof(f#>'{core,id}') is distinct from 'string' then return false; end if;
 if coalesce(p_source,'') !~ '[^[:space:]]' or f#>>'{core,id}' is distinct from p_source or coalesce(kind,'') not in ('whole_building','commercial_complex','apartment','floor','house','villa','office','shop','warehouse','chalet','other_built_property') then return false; end if;
 if jsonb_typeof(f#>'{core,locationArea}') is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(f#>'{core,locationArea}') e(k) where e.k<>'id') then return false; end if;
 if jsonb_typeof(f#>'{core,locationArea,id}') is distinct from 'string' then return false; end if;
 if coalesce(f#>>'{core,locationArea,id}','') !~ '^[a-z][a-z0-9_]{0,63}$' then return false; end if;
 if exists(select 1 from jsonb_object_keys(f->'activeOffer') e(k) where e.k not in ('id','propertyCoreId','transaction','rentalPrice','rentalPeriodId','salePrice')) then return false; end if;
 if f#>>'{activeOffer,propertyCoreId}' is distinct from p_source or coalesce(transaction,'') not in ('rent','sale') then return false; end if;
 if jsonb_typeof(f#>'{activeOffer,id}') is distinct from 'string' or coalesce(f#>>'{activeOffer,id}','') !~ '^[A-Za-z0-9_-]{1,128}$' then return false; end if;
 if transaction='rent' then
  if kind='commercial_complex' or (f->'activeOffer') ? 'salePrice'
    or ((f->'activeOffer') ? 'rentalPeriodId' and coalesce(f#>>'{activeOffer,rentalPeriodId}','') not in ('daily','monthly','yearly')) then return false; end if;
  price := f#>'{activeOffer,rentalPrice}';
 else
  if (f->'activeOffer') ?| array['rentalPrice','rentalPeriodId'] then return false; end if;
  price := f#>'{activeOffer,salePrice}';
 end if;
 if jsonb_typeof(price) is distinct from 'object' or price->>'currencyCode' is distinct from 'KWD'
   or jsonb_typeof(price->'amount') is distinct from 'number'
   or price - array['amount','currencyCode'] <> '{}'::jsonb
   or (price->>'amount')::numeric<=0 or (price->>'amount')::numeric>9007199254740991 then return false; end if;
 if f ? 'areaSquareMeters' and (jsonb_typeof(f->'areaSquareMeters') <> 'number' or (f->>'areaSquareMeters')::numeric<0) then return false; end if;
 if f ? 'areaUnit' and f->>'areaUnit' is distinct from 'square_meter' then return false; end if;
 if f ? 'nearbyServices' and (not viewstate_circle.valid_circle_ids(f->'nearbyServices') or not (f->'nearbyServices') <@ '["supermarket","school","hospital","mosque","restaurant","bus_station","bank_atm","pharmacy","club_gym","beach","cafe","laundry","clinic","nursery","park","shopping_center","other"]'::jsonb) then return false; end if;
 if f ? 'marketingStatus' and coalesce(f->>'marketingStatus','') not in ('active','paused','sold') then return false; end if;
 if f->>'marketingStatus'='sold' and transaction<>'sale' then return false; end if;
 if f ? 'rentalAvailability' and coalesce(f->>'rentalAvailability','') not in ('available','rented') then return false; end if;
 if details->>'propertyType' is distinct from kind then return false; end if;
 if kind='other_built_property' and not details ? 'clarification' then return false; end if;
 if kind='floor' and details - 'propertyType' <> '{}'::jsonb and coalesce(details->>'floorUse','') not in ('residential','commercial') then return false; end if;
 for k,v in select * from jsonb_each(details - 'propertyType') loop
  -- Snapshot of PROPERTY_DETAIL_FIELD_DEFINITIONS for database-side authorization.
  if not exists(
   select 1 from (values
    ('kitchens', array['apartment','house','villa','chalet','office','shop','floor','other_built_property'], null::text[], null::text[], null::text[]),
    ('buildingAgeBand', array['commercial_complex','floor','warehouse','whole_building','office','shop','other_built_property'], array['commercial'], null::text[], null::text[]),
    ('parkingTypes', array['commercial_complex','floor','whole_building','office','shop','other_built_property'], array['commercial'], null::text[], null::text[]),
    ('privateParkingCount', array['commercial_complex','floor','whole_building','office','shop','other_built_property'], array['commercial'], null::text[], null::text[]),
    ('rentalOccupancy', array['commercial_complex','floor','whole_building'], array['commercial'], null::text[], null::text[]),
    ('monthlyIncome', array['commercial_complex','floor','whole_building'], array['commercial'], null::text[], null::text[]),
    ('hasBasement', array['commercial_complex','whole_building'], null::text[], null::text[], null::text[]),
    ('streetPosition', array['commercial_complex','whole_building'], null::text[], null::text[], null::text[]),
    ('hasMortgage', array['commercial_complex','whole_building'], null::text[], null::text[], null::text[]),
    ('hasPrivateEntrance', array['floor','office','other_built_property'], array['commercial'], null::text[], null::text[]),
    ('hasAccessibleEntrance', array['floor','whole_building','commercial_complex','office','other_built_property'], array['commercial'], null::text[], null::text[]),
    ('plotAreaSquareMeters', array['whole_building','commercial_complex','house','villa','warehouse','chalet','other_built_property'], null::text[], null::text[], null::text[]),
    ('builtUpAreaSquareMeters', array['whole_building','commercial_complex','apartment','floor','house','villa','office','shop','warehouse','chalet','other_built_property'], null::text[], null::text[], null::text[]),
    ('bathroomCount', array['apartment','floor','house','villa','office','shop','warehouse','chalet','other_built_property'], null::text[], null::text[], null::text[]),
    ('parkingSpaceCount', array['whole_building','commercial_complex','apartment','floor','house','villa','office','shop','warehouse','chalet','other_built_property'], null::text[], null::text[], null::text[]),
    ('floorCount', array['whole_building','commercial_complex','house','villa','chalet'], null::text[], null::text[], null::text[]),
    ('unitCount', array['whole_building','commercial_complex'], null::text[], null::text[], null::text[]),
    ('roomsPerUnit', array['whole_building','commercial_complex'], null::text[], null::text[], null::text[]),
    ('bathroomsPerUnit', array['whole_building','commercial_complex'], null::text[], null::text[], null::text[]),
    ('apartmentCount', array['whole_building','commercial_complex'], null::text[], null::text[], null::text[]),
    ('shopCount', array['whole_building','commercial_complex'], null::text[], null::text[], null::text[]),
    ('officeCount', array['whole_building','commercial_complex'], null::text[], null::text[], null::text[]),
    ('elevatorCount', array['whole_building','commercial_complex'], null::text[], null::text[], null::text[]),
    ('apartmentSubtype', array['apartment'], null::text[], null::text[], null::text[]),
    ('studioRoomCount', array['apartment'], null::text[], null::text[], array['studio']),
    ('propertyUse', array['other_built_property'], null::text[], null::text[], null::text[]),
    ('occupancy', array['whole_building','apartment','floor','house','villa','chalet','other_built_property'], array['residential'], array['residential'], null::text[]),
    ('bedroomCount', array['whole_building','apartment','floor','house','villa','chalet','other_built_property'], array['residential'], array['residential'], null::text[]),
    ('masterBedroomCount', array['whole_building','apartment','floor','house','villa','chalet','other_built_property'], array['residential'], array['residential'], array['standard_apartment','duplex']),
    ('livingRoomCount', array['apartment','floor','house','villa','chalet','other_built_property'], array['residential'], array['residential'], null::text[]),
    ('floorNumber', array['apartment','floor','office','shop'], null::text[], null::text[], null::text[]),
    ('floorUse', array['floor'], null::text[], null::text[], null::text[]),
    ('furnishing', array['apartment','floor','house','villa','chalet','whole_building','other_built_property'], array['residential'], array['residential'], null::text[]),
    ('hasMaidRoom', array['apartment','floor','house','villa','chalet','other_built_property'], array['residential'], array['residential'], null::text[]),
    ('hasHeating', array['apartment','floor','house','villa','chalet'], array['residential'], null::text[], null::text[]),
    ('hasBalcony', array['apartment','floor','house','villa','chalet','other_built_property'], array['residential','commercial'], array['residential'], null::text[]),
    ('hasLaundryRoom', array['apartment','floor','house','villa','chalet','other_built_property'], array['residential'], array['residential'], null::text[]),
    ('hasSolarHeater', array['apartment','floor','house','villa','chalet'], array['residential'], null::text[], null::text[]),
    ('hasElevator', array['apartment','floor','house','villa','chalet','commercial_complex','office','other_built_property'], array['residential','commercial'], null::text[], null::text[]),
    ('hasGarden', array['apartment','floor','house','villa','chalet'], array['residential'], null::text[], null::text[]),
    ('hasSecurityGuard', array['apartment','floor','house','villa','chalet','whole_building','commercial_complex','office','other_built_property'], array['residential','commercial'], null::text[], null::text[]),
    ('hasBBQArea', array['apartment','floor','house','villa','chalet'], array['residential'], null::text[], null::text[]),
    ('hasPool', array['house','villa','chalet'], null::text[], null::text[], null::text[]),
    ('hasWaterfront', array['chalet'], null::text[], null::text[], null::text[]),
    ('hasCentralAC', array['whole_building','apartment','floor','house','villa','chalet','commercial_complex','office','shop','warehouse','other_built_property'], null::text[], null::text[], null::text[]),
    ('automaticNumberCount', array['office','floor'], array['commercial'], null::text[], null::text[]),
    ('hasFacilityCleaning', array['office','floor'], array['commercial'], null::text[], null::text[]),
    ('kitchenAccess', array['office','floor'], array['commercial'], null::text[], null::text[]),
    ('hasKitchen', array['apartment','floor','office','other_built_property'], array['commercial'], null::text[], array['studio']),
    ('hasSplitAC', array['apartment'], null::text[], null::text[], array['studio']),
    ('hasSharedPool', array['apartment'], null::text[], null::text[], array['studio']),
    ('hasSharedGym', array['apartment'], null::text[], null::text[], array['studio']),
    ('hasSeaView', array['apartment'], null::text[], null::text[], array['studio']),
    ('hasHall', array['apartment'], null::text[], null::text[], array['studio']),
    ('hasParking', array['apartment'], null::text[], null::text[], array['studio']),
    ('intendedUse', array['floor','office','shop','warehouse','other_built_property'], array['commercial'], null::text[], null::text[]),
    ('commercialActivity', array['floor','office','shop','warehouse'], array['commercial'], null::text[], null::text[]),
    ('frontageWidthMeters', array['floor','shop','commercial_complex'], array['commercial'], null::text[], null::text[]),
    ('ceilingHeightMeters', array['floor','shop','warehouse'], array['commercial'], null::text[], null::text[]),
    ('warehouseFinish', array['warehouse'], null::text[], null::text[], null::text[]),
    ('warehouseKind', array['warehouse'], null::text[], null::text[], null::text[]),
    ('warehouseLevels', array['warehouse'], null::text[], null::text[], null::text[]),
    ('entranceCount', array['warehouse','shop'], null::text[], null::text[], null::text[]),
    ('hasVehicleRamp', array['warehouse'], null::text[], null::text[], null::text[]),
    ('rampVehicleSize', array['warehouse'], null::text[], null::text[], null::text[]),
    ('hasServiceElevator', array['warehouse'], null::text[], null::text[], null::text[]),
    ('serviceElevatorCapacityTons', array['warehouse'], null::text[], null::text[], null::text[]),
    ('hasEscalator', array['warehouse','commercial_complex'], null::text[], null::text[], null::text[]),
    ('hasFireSystem', array['warehouse','whole_building','commercial_complex','floor','office','shop','other_built_property'], array['commercial'], null::text[], null::text[]),
    ('electricityPhase', array['warehouse'], null::text[], null::text[], null::text[]),
    ('electricityCapacity', array['warehouse'], null::text[], null::text[], null::text[]),
    ('electricityCapacityUnit', array['warehouse'], null::text[], null::text[], null::text[]),
    ('loadingBayCount', array['warehouse'], null::text[], null::text[], null::text[]),
    ('hasColdStorage', array['warehouse'], null::text[], null::text[], null::text[]),
    ('housingTypes', array['whole_building'], null::text[], null::text[], null::text[]),
    ('hasBuildingParking', array['whole_building'], null::text[], null::text[], null::text[]),
    ('buildingParkingTypes', array['whole_building'], null::text[], null::text[], null::text[]),
    ('sameApartmentLayout', array['whole_building'], null::text[], null::text[], null::text[]),
    ('sameApartmentsPerFloor', array['whole_building'], null::text[], null::text[], null::text[]),
    ('apartmentsPerFloor', array['whole_building'], null::text[], null::text[], null::text[]),
    ('apartmentLayouts', array['whole_building'], null::text[], null::text[], null::text[]),
    ('floorApartmentCounts', array['whole_building'], null::text[], null::text[], null::text[]),
    ('hasCommercialShops', array['whole_building'], null::text[], null::text[], null::text[]),
    ('hasCommercialFloors', array['whole_building'], null::text[], null::text[], null::text[]),
    ('commercialFloorCount', array['whole_building'], null::text[], null::text[], null::text[]),
    ('hasGuardRoom', array['whole_building','villa','house','chalet'], null::text[], null::text[], null::text[]),
    ('hasCCTV', array['whole_building','commercial_complex','floor','office','other_built_property'], array['commercial'], null::text[], null::text[]),
    ('hasLoadingArea', array['commercial_complex','shop','other_built_property'], null::text[], null::text[], null::text[]),
    ('hasSharedBathrooms', array['commercial_complex'], null::text[], null::text[], null::text[]),
    ('hasPrivateBathroom', array['office'], null::text[], null::text[], null::text[]),
    ('hasGlassFront', array['shop'], null::text[], null::text[], null::text[]),
    ('hasMezzanine', array['shop'], null::text[], null::text[], null::text[]),
    ('hasAttachedStorage', array['shop'], null::text[], null::text[], null::text[]),
    ('hasWaterDrainage', array['shop'], null::text[], null::text[], null::text[]),
    ('hasVentilation', array['shop'], null::text[], null::text[], null::text[]),
    ('rentalScope', array['commercial_complex'], null::text[], null::text[], null::text[]),
    ('availableUnitCount', array['commercial_complex'], null::text[], null::text[], null::text[]),
    ('availableAreaSquareMeters', array['commercial_complex'], null::text[], null::text[], null::text[]),
    ('availableFrom', array['floor'], array['commercial'], null::text[], null::text[]),
    ('clarification', array['other_built_property'], null::text[], null::text[], null::text[])
   ) as field(key,types,floor_uses,property_uses,subtypes)
   where field.key=k and kind=any(types)
    and (kind<>'floor' or floor_uses is null or coalesce(details->>'floorUse','')=any(floor_uses))
    and (kind<>'other_built_property' or property_uses is null or coalesce(details->>'propertyUse','')=any(property_uses))
    and (kind<>'apartment' or subtypes is null or coalesce(details->>'apartmentSubtype','standard_apartment')=any(subtypes))
  ) then return false; end if;
  choices := case k
    when 'apartmentSubtype' then array['studio','standard_apartment','duplex']
    when 'furnishing' then array['furnished','semi_furnished','unfurnished']
    when 'floorUse' then array['residential','commercial']
    when 'propertyUse' then array['residential','commercial']
    when 'occupancy' then array['family','bachelor','company_staff','women','mixed','any']
    when 'buildingAgeBand' then array['1_5','6_12','over_12']
    when 'warehouseFinish' then array['normal','good','super_deluxe']
    when 'warehouseKind' then array['industrial','food']
    when 'rampVehicleSize' then array['large','medium','small']
    when 'electricityPhase' then array['two_phase','three_phase']
    when 'electricityCapacityUnit' then array['A','kW','kVA']
    when 'streetPosition' then array['one_street','two_streets','corner','front_back']
    when 'rentalOccupancy' then case when kind='floor' then array['vacant','rented'] else array['vacant','fully_rented','partially_rented'] end
    when 'rentalScope' then array['entire','partial']
    when 'kitchenAccess' then array['private','shared']
    else null end;
  if choices is not null then
   if jsonb_typeof(v)<>'string' or not (v#>>'{}')=any(choices) then return false; end if;
  elsif k like 'has%' or k in ('sameApartmentLayout','sameApartmentsPerFloor') then
   if jsonb_typeof(v)<>'boolean' then return false; end if;
  elsif k in ('clarification','commercialActivity','intendedUse') then
   if jsonb_typeof(v)<>'object' or v - array['value','privacy'] <> '{}'::jsonb
     or v->'privacy' is distinct from '{"classification":"normal","disclosurePolicy":"normal"}'::jsonb
     or jsonb_typeof(v->'value') is distinct from 'string'
     or coalesce(length(btrim(v->>'value')),0) not between 1 and 250
     or (k='clarification' and v->>'value'<>'Other built property')
     or (k='commercialActivity' and v->>'value' not in ('retail','office','restaurant','clinic','warehouse'))
     or (k='intendedUse' and v->>'value' not in ('office','retail','warehouse','residential')) then return false; end if;
  elsif k='availableFrom' then
   if jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$'
     or to_char((v#>>'{}')::date,'YYYY-MM-DD')<>(v#>>'{}') then return false; end if;
  elsif k='kitchens' then
   if not viewstate_circle.valid_circle_kitchens(v) then return false; end if;
  elsif k in ('warehouseLevels','housingTypes','parkingTypes','buildingParkingTypes') then
   if not viewstate_circle.valid_circle_ids(v) then return false; end if;
   choices := case k
     when 'warehouseLevels' then array['ground','basement']
     when 'housingTypes' then array['company_staff','bachelor','family','women','mixed']
     when 'parkingTypes' then array['private','public','paid']
     else array['public_yard','in_building'] end;
   if exists(select 1 from jsonb_array_elements_text(v) value where not value=any(choices)) then return false; end if;
  elsif k in ('apartmentLayouts','floorApartmentCounts') then
   choices := case k when 'apartmentLayouts' then array['apartmentCount','bedrooms','bathrooms'] else array['floorNumber','apartmentCount'] end;
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)=0 then return false; end if;
   for child in select value from jsonb_array_elements(v) loop
    if jsonb_typeof(child)<>'object' or not child ?& choices or child - choices <> '{}'::jsonb
      or exists(select 1 from jsonb_each(child) e(key,value) where not viewstate_circle.valid_circle_number(value,true,case when key='apartmentCount' then 1 else 0 end)) then return false; end if;
   end loop;
  elsif not viewstate_circle.valid_circle_number(v,
      k not in ('plotAreaSquareMeters','builtUpAreaSquareMeters','frontageWidthMeters','ceilingHeightMeters','serviceElevatorCapacityTons','electricityCapacity','availableAreaSquareMeters','monthlyIncome'),
      case when k in ('apartmentsPerFloor','commercialFloorCount','availableUnitCount') or (k='floorCount' and kind='commercial_complex') then 1 else 0 end) then
   return false;
  elsif k in ('plotAreaSquareMeters','builtUpAreaSquareMeters','frontageWidthMeters','ceilingHeightMeters','serviceElevatorCapacityTons','electricityCapacity','availableAreaSquareMeters')
    and (v#>>'{}')::numeric=0 then return false;
  end if;
 end loop;
 if (details ? 'kitchenAccess' and details->'hasKitchen' is distinct from 'true'::jsonb)
  or (details ? 'buildingParkingTypes' and details->'hasBuildingParking' is distinct from 'true'::jsonb)
  or (details ? 'privateParkingCount' and not coalesce(details->'parkingTypes' ? 'private',false))
  or (details ? 'apartmentsPerFloor' and details->'sameApartmentsPerFloor' is distinct from 'true'::jsonb)
  or (details ? 'floorApartmentCounts' and details->'sameApartmentsPerFloor' is distinct from 'false'::jsonb)
  or (details ? 'apartmentLayouts' and details->'sameApartmentLayout' is distinct from 'false'::jsonb)
  or (details ? 'commercialFloorCount' and details->'hasCommercialFloors' is distinct from 'true'::jsonb)
  or (details ?| array['availableUnitCount','availableAreaSquareMeters'] and details->>'rentalScope' is distinct from 'partial')
  or (details ? 'rampVehicleSize' and details->'hasVehicleRamp' is distinct from 'true'::jsonb)
  or (details ? 'serviceElevatorCapacityTons' and details->'hasServiceElevator' is distinct from 'true'::jsonb)
  or (details ? 'hasColdStorage' and details->>'warehouseKind'='industrial')
  or (details ? 'electricityCapacity' and not details ? 'electricityCapacityUnit')
  or ((details->>'availableUnitCount')::numeric > (details->>'unitCount')::numeric)
  or ((details->>'commercialFloorCount')::numeric > (details->>'floorCount')::numeric) then return false; end if;
 if f->'typeDetails' ? 'studioRoomCount' and (
   f#>>'{typeDetails,apartmentSubtype}' is distinct from 'studio'
   or (f#>>'{typeDetails,studioRoomCount}')::numeric <> 1
 ) then return false; end if;
 if f->'typeDetails' ? 'masterBedroomCount' and (
   f#>>'{typeDetails,apartmentSubtype}' = 'studio'
   or (f#>>'{typeDetails,masterBedroomCount}')::numeric >
      (f#>>'{typeDetails,bedroomCount}')::numeric
 ) then return false; end if;
 return true;
exception when others then return false;
end $$;

create function viewstate_circle.valid_request_facts(f jsonb)
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
    if item->>'kind'='number' then
     if not coalesce(item->>'comparison'=case when item->>'field'='floorNumber' then 'exact' else 'minimum' end,false)
      or coalesce(item->>'field','') not in ('plotAreaSquareMeters','builtUpAreaSquareMeters','parkingSpaceCount','livingRoomCount','floorNumber')
      or not viewstate_circle.valid_circle_number(item->'value',item->>'field' in ('parkingSpaceCount','livingRoomCount','floorNumber'),0) then return false; end if;
    elsif item->>'kind'='feature' then
     if item ? 'comparison' or jsonb_typeof(item->'value') is distinct from 'boolean'
      or coalesce(item->>'field','') not in ('hasGuardRoom','hasMaidRoom','hasHeating','hasBalcony','hasLaundryRoom','hasSolarHeater','hasElevator','hasGarden','hasSecurityGuard','hasBBQArea','hasPool','hasWaterfront','hasColdStorage','hasKitchen','hasHall','hasParking','hasSplitAC','hasSharedPool','hasSharedGym','hasSeaView') then return false; end if;
    elsif item->>'kind'='choice' then
     allowed := case item->>'field'
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

create function public.vs_circle_request(
 p_circle uuid, p_source uuid, p_facts jsonb, p_withdraw boolean default false
) returns void language plpgsql security definer set search_path='' as $$
declare who uuid;
begin
 perform 1 from viewstate_circle.circles where id=p_circle for update;
 who := viewstate_circle.require_member(p_circle);
 if p_source is null or p_withdraw is null then
  raise exception 'CIRCLE_REQUEST_INVALID' using errcode='22023';
 end if;
 if p_withdraw then
  delete from viewstate_circle.requests where circle_id=p_circle and owner_id=who and source_key=p_source;
  if found then perform viewstate_circle.bump(p_circle); end if;
  return;
 end if;
 if not viewstate_circle.valid_request_facts(p_facts) then
  raise exception 'CIRCLE_REQUEST_INVALID' using errcode='22023';
 end if;
 if not exists(select 1 from viewstate_circle.requests where circle_id=p_circle and owner_id=who and source_key=p_source)
   and (select count(*) from viewstate_circle.requests where circle_id=p_circle)>=200 then
  raise exception 'CIRCLE_REQUEST_LIMIT' using errcode='22023';
 end if;
 insert into viewstate_circle.requests as existing(circle_id,owner_id,source_key,facts)
 values(p_circle,who,p_source,p_facts)
 on conflict(circle_id,owner_id,source_key) do update
   set facts=excluded.facts, revision=existing.revision+1 where existing.facts is distinct from excluded.facts;
 if found then perform viewstate_circle.bump(p_circle); end if;
end $$;

revoke all on function public.vs_circle_request(uuid,uuid,jsonb,boolean) from public, anon;
grant execute on function public.vs_circle_request(uuid,uuid,jsonb,boolean) to authenticated;
