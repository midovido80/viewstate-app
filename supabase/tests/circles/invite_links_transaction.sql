do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); cid uuid:=gen_random_uuid();
token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
expired_token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
preview jsonb; joined uuid; result jsonb; denied boolean:=false;
begin
 begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,is_anonymous,created_at,updated_at)
   select x,'authenticated','authenticated','circle-qa-'||x||'@example.invalid','{}','{}',false,now(),now() from unnest(array[a,b,c]) x;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
  perform set_config('role','authenticated',true);
  perform public.vs_circle_create(cid,'اختبار دعوة مؤقت');
  perform public.vs_circle_invite_link(cid,token);
  perform public.vs_circle_invite_link(cid,token);
  perform public.vs_circle_invite_link(cid,expired_token);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','is_anonymous',false)::text,true);
  preview:=public.vs_circle_invite_preview(token);
  if preview->>'circleName'<>'اختبار دعوة مؤقت' then raise exception 'PREVIEW_FAILED'; end if;
  joined:=public.vs_circle_invite_accept(token);
  if joined<>cid or public.vs_circle_invite_accept(token)<>cid then raise exception 'ACCEPT_IDEMPOTENCY_FAILED'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c,'role','authenticated','is_anonymous',false)::text,true);
  begin perform public.vs_circle_invite_accept(token); exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'REPLAY_NOT_BLOCKED'; end if;
  perform set_config('role','none',true);
  update viewstate_circle.invite_links set expires_at=now()-interval '1 second' where circle_id=cid and used_at is null;
  perform set_config('role','authenticated',true);
  if public.vs_circle_invite_preview(expired_token) is not null then raise exception 'EXPIRED_PREVIEW_ALLOWED'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
  result:=public.vs_circle_invite_phone(cid,'+15550001111');
  if result->>'status'<>'unavailable' then raise exception 'UNCONFIRMED_ROUTING_FAILED'; end if;
  result:=jsonb_build_object('evidence','HOSTED_INVITE_ROLLBACK_NOT_DEVICE_E2E','preview',true,'accept_idempotent',true,'replay_denied',true,'expiry_checked',true,'unconfirmed_phone_not_routed',true);
  raise exception using errcode='ZC020',message='ROLLBACK_INVITE_QA';
 exception when sqlstate 'ZC020' then null;
 end;
 perform set_config('role','none',true);
 if exists(select 1 from auth.users where id in(a,b,c)) or exists(select 1 from viewstate_circle.invite_links where circle_id=cid) then raise exception 'FIXTURES_REMAIN'; end if;
 perform set_config('viewstate_circle.invite_report',(result||'{"fixtures_removed":true}'::jsonb)::text,true);
end $$;
select current_setting('viewstate_circle.invite_report')::jsonb report;
