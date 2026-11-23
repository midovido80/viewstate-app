do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); cid uuid:=gen_random_uuid(); src uuid:=gen_random_uuid(); reqsrc uuid:=gen_random_uuid();
 pid uuid; rid uuid; snap jsonb; rev bigint; committed boolean; n1 int; n2 int; deliveries int; report jsonb; members_count int;
 facts jsonb; target1 jsonb; target2 jsonb; notice uuid;
begin
 begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,is_anonymous,created_at,updated_at)
   values(a,'authenticated','authenticated','qa-'||a||'@example.invalid','{}','{}',false,now(),now()),(b,'authenticated','authenticated','qa-'||b||'@example.invalid','{}','{}',false,now(),now());
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
  perform set_config('role','authenticated',true);
  perform public.vs_circle_create(cid,'اختبار مؤقت لا يظهر للمستخدمين');
  perform public.vs_circle_member(cid,b,'invite');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','is_anonymous',false)::text,true);
  perform public.vs_circle_accept(cid);
  select count(*) into members_count from public.vs_circle_members(cid);
  if members_count<>2 then raise exception 'MEMBER_LIST_FAILED'; end if;
  perform public.vs_circle_request(cid,reqsrc,array['salmiya'],550,'monthly',3,2);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
  facts:=jsonb_build_object('core',jsonb_build_object('id',src::text,'propertyType','apartment','locationArea',jsonb_build_object('id','salmiya')),
   'activeOffer',jsonb_build_object('id',gen_random_uuid()::text,'propertyCoreId',src::text,'transaction','rent','rentalPrice',jsonb_build_object('amount',500,'currencyCode','KWD'),'rentalPeriodId','monthly'),
   'typeDetails',jsonb_build_object('propertyType','apartment','apartmentSubtype','standard_apartment','bedroomCount',3,'bathroomCount',2),
   'marketingStatus','active','rentalAvailability','available');
  perform public.vs_circle_publish(cid,src::text,0,gen_random_uuid(),facts,false);
  perform set_config('role','none',true);
  select id into pid from viewstate_circle.properties where circle_id=cid and source_key=src::text;
  select id into rid from viewstate_circle.requests where circle_id=cid and source_key=reqsrc;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('role','service_role',true);
  snap:=public.vs_circle_worker_snapshot(cid); rev:=(snap->>'revision')::bigint;
  committed:=public.vs_circle_worker_commit(cid,rev,jsonb_build_array(jsonb_build_object('request_id',rid,'property_id',pid,'score',100)));
  if not committed then raise exception 'COMMIT_FAILED'; end if;
  if public.vs_circle_worker_commit(cid,rev,jsonb_build_array(jsonb_build_object('request_id',rid,'property_id',pid,'score',100))) then raise exception 'REPLAY_ACCEPTED'; end if;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
  select count(*) into n1 from jsonb_array_elements(public.vs_circle_notification_inbox()->'entries') e where e->>'kind'='match';
  select (e->>'id')::uuid into notice from jsonb_array_elements(public.vs_circle_notification_inbox()->'entries') e where e->>'kind'='match';
  target1:=public.vs_circle_notification_open(notice);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','is_anonymous',false)::text,true);
  select count(*) into n2 from jsonb_array_elements(public.vs_circle_notification_inbox()->'entries') e where e->>'kind'='match';
  select (e->>'id')::uuid into notice from jsonb_array_elements(public.vs_circle_notification_inbox()->'entries') e where e->>'kind'='match';
  target2:=public.vs_circle_notification_open(notice);
  if target1->>'matchId' is null or target1->>'matchId' is distinct from target2->>'matchId' or target1->>'kind'<>'requirement' or target2->>'kind'<>'listing' then raise exception 'MATCH_TARGETS_FAILED'; end if;
  if n1<>1 or n2<>1 then raise exception 'RECIPIENT_INBOX_FAILED: %, %',n1,n2; end if;
  perform set_config('role','none',true);
  select count(*) into deliveries from viewstate_circle.notification_delivery d join viewstate_circle.notification_inbox i on i.id=d.notice_id where i.circle_id=cid;
  if deliveries<>0 then raise exception 'UNEXPECTED_DEVICE_DELIVERY'; end if;
  report:=jsonb_build_object('evidence','HOSTED_ROLLBACK_RPC_INBOX_NOT_PHYSICAL_PUSH','members',members_count,'publisher_match_notices',n1,'requester_match_notices',n2,'same_match_target',true,'legacy_routes_preserved',true,'replay_rejected',true,'external_pushes',0);
  raise exception using errcode='ZC019',message='ROLLBACK_QA_FIXTURES';
 exception when sqlstate 'ZC019' then null;
 end;
 perform set_config('role','none',true);
 if exists(select 1 from auth.users where id in (a,b)) or exists(select 1 from viewstate_circle.circles where id=cid) then raise exception 'FIXTURES_REMAIN'; end if;
 perform set_config('viewstate_circle.nov19_report',(report||'{"fixtures_removed":true}'::jsonb)::text,true);
end $$;
select current_setting('viewstate_circle.nov19_report')::jsonb report;
