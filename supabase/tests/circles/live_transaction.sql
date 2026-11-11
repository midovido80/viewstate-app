-- Hosted SQL/RLS acceptance with temporary auth-row fixtures, NOT real login/device E2E.
-- Everything created in the inner block is rolled back before returning its report.
do $$
declare
 actor_ids uuid[]:=array(select gen_random_uuid() from generate_series(1,9));
 sources uuid[]:=array(select gen_random_uuid() from generate_series(1,30));
 areas text[]:=array['salmiya','jabriya','hawally','salwa','bayan','mishref','mangaf','mahboula'];
 cid uuid:=gen_random_uuid(); b integer; i integer; total integer; denied integer:=0;
 facts jsonb; first_facts jsonb; first_receipt jsonb; receipt jsonb; snapshot jsonb;
 report jsonb; policies_before jsonb; policies_after jsonb;
begin
 select jsonb_agg(to_jsonb(p) order by tablename,policyname) into policies_before from pg_policies p where schemaname='public';
 begin
  for b in 1..9 loop
   insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,is_anonymous,created_at,updated_at)
   values(actor_ids[b],'authenticated','authenticated','circle-test-'||actor_ids[b]::text||'@example.invalid','{}','{}',false,now(),now());
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_ids[1],'role','authenticated','is_anonymous',false)::text,true);
  perform set_config('role','authenticated',true);
  perform public.vs_circle_create(cid,'دائرة اختبار مؤقت');
  for b in 2..8 loop
   perform public.vs_circle_member(cid,actor_ids[b],'invite');
  end loop;
  for b in 2..8 loop
   perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_ids[b],'role','authenticated','is_anonymous',false)::text,true);
   begin
    perform public.vs_circle_catalog(cid); raise exception 'TEST_PENDING_READ_ALLOWED';
   exception when insufficient_privilege then denied:=denied+1; end;
   perform public.vs_circle_accept(cid);
  end loop;
  for i in 1..30 loop
   b:=((i-1)%8)+1;
   perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_ids[b],'role','authenticated','is_anonymous',false)::text,true);
   facts:=jsonb_build_object(
    'core',jsonb_build_object('id',sources[i]::text,'propertyType','apartment','locationArea',jsonb_build_object('id',areas[b])),
    'activeOffer',jsonb_build_object('id',gen_random_uuid()::text,'propertyCoreId',sources[i]::text,'transaction','rent','rentalPrice',jsonb_build_object('amount',300+(i-1)*5,'currencyCode','KWD'),'rentalPeriodId','monthly'),
    'typeDetails',jsonb_build_object('propertyType','apartment','apartmentSubtype','standard_apartment','bedroomCount',2+(i-1)%3,'bathroomCount',2+(i-1)%2),
    'marketingStatus','active','rentalAvailability','available');
   receipt:=public.vs_circle_publish(cid,sources[i]::text,0,gen_random_uuid(),facts,false);
   if i=1 then first_facts:=facts;first_receipt:=receipt;end if;
  end loop;
  for b in 1..8 loop
   perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_ids[b],'role','authenticated','is_anonymous',false)::text,true);
   select count(*) into total from public.vs_circle_catalog(cid);
   if total<>30 then raise exception 'TEST_MEMBER_CATALOG_COUNT: %',total;end if;
  end loop;
  select jsonb_agg(to_jsonb(c)) into snapshot from public.vs_circle_catalog(cid) c;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_ids[9],'role','authenticated','is_anonymous',false)::text,true);
  begin perform public.vs_circle_catalog(cid);raise exception 'TEST_OUTSIDER_RPC_ALLOWED';exception when insufficient_privilege then denied:=denied+1;end;
  select count(*) into total from viewstate_circle.properties where circle_id=cid;
  if total<>0 then raise exception 'TEST_OUTSIDER_RLS_ALLOWED';end if;
  begin
   insert into viewstate_circle.members(circle_id,user_id,state) values(cid,actor_ids[9],'active');raise exception 'TEST_DIRECT_JOIN_ALLOWED';
  exception when insufficient_privilege then denied:=denied+1;end;
  begin perform public.vs_circle_member(cid,actor_ids[9],'invite');raise exception 'TEST_SELF_INVITE_ALLOWED';exception when insufficient_privilege then denied:=denied+1;end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_ids[1],'role','authenticated','is_anonymous',false)::text,true);
  begin
   perform public.vs_circle_publish(cid,sources[1]::text,1,gen_random_uuid(),first_facts||jsonb_build_object('notes','PRIVATE_SENTINEL'),false);
   raise exception 'TEST_PRIVATE_FIELD_ACCEPTED';
  exception when invalid_parameter_value then denied:=denied+1;end;
  begin
   perform public.vs_circle_publish(cid,sources[1]::text,0,gen_random_uuid(),first_facts,false);raise exception 'TEST_OLD_REVISION_ALLOWED';
  exception when serialization_failure then denied:=denied+1;end;
  receipt:=public.vs_circle_publish(cid,sources[1]::text,1,gen_random_uuid(),first_facts||jsonb_build_object('rentalAvailability','rented'),false);
  if (receipt->>'revision')::int<>2 then raise exception 'TEST_STATUS_REVISION';end if;
  receipt:=public.vs_circle_publish(cid,sources[1]::text,2,gen_random_uuid(),null,true);
  if (receipt->>'revision')::int<>3 then raise exception 'TEST_WITHDRAW_REVISION';end if;
  select count(*) into total from public.vs_circle_catalog(cid);
  if total<>29 then raise exception 'TEST_WITHDRAW_CATALOG_COUNT';end if;
  perform public.vs_circle_member(cid,actor_ids[2],'revoke');
  select count(*) into total from public.vs_circle_catalog(cid);
  if total<>25 then raise exception 'TEST_REVOKED_PUBLISHER_STILL_VISIBLE: %',total;end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_ids[2],'role','authenticated','is_anonymous',false)::text,true);
  begin perform public.vs_circle_catalog(cid);raise exception 'TEST_REVOKED_MEMBER_READ';exception when insufficient_privilege then denied:=denied+1;end;
  begin perform public.vs_circle_publish(cid,sources[2]::text,1,gen_random_uuid(),first_facts,false);raise exception 'TEST_REVOKED_MEMBER_WRITE';exception when insufficient_privilege then denied:=denied+1;end;
  report:=jsonb_build_object('evidence','HOSTED_POSTGRES_ROLE_RLS_RPC_NOT_LOGIN_OR_DEVICE_E2E','broker_identities',8,'outsider_identities',1,'shared_properties',30,'active_member_read_checks',8,'expected_denials',denied,'remaining_after_withdraw_and_member_removal',total,'fixture_publishers',to_jsonb(actor_ids[1:8]),'catalog',snapshot);
  raise exception using errcode='ZC001',message='ROLL_BACK_CIRCLE_TEST_FIXTURES';
 exception when sqlstate 'ZC001' then null;
 end;
 perform set_config('role','none',true);
 if exists(select 1 from auth.users where id=any(actor_ids)) or exists(select 1 from viewstate_circle.circles where id=cid) then raise exception 'TEST_FIXTURES_NOT_REMOVED';end if;
 select jsonb_agg(to_jsonb(p) order by tablename,policyname) into policies_after from pg_policies p where schemaname='public';
 if policies_before is distinct from policies_after then raise exception 'TEST_PRIVATE_POLICIES_CHANGED';end if;
 perform set_config('viewstate_circle.test_report',(report||jsonb_build_object('fixtures_removed',true,'private_policies_unchanged',true))::text,true);
end $$;
select current_setting('viewstate_circle.test_report')::jsonb as report;
