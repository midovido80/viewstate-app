begin;
-- Reuse one existing account only inside a rolled-back transaction; never create auth users or email anyone.
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users order by created_at limit 1),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$
declare a jsonb; b jsonb; start_rev bigint;
begin
 select coalesce(max(revision),0) into start_rev from public.account_workspaces;
 a:=public.commit_account_workspace(start_rev,'{"version":1,"records":{"dismissed/sync-test":true}}'::jsonb);
 if a->>'accepted'<>'true' then raise exception 'CAS insert failed';end if;
 b:=public.commit_account_workspace(start_rev,'{"version":1,"records":{}}'::jsonb);
 if b->>'accepted'<>'false' then raise exception 'stale write accepted';end if;
 if (select count(*) from public.account_workspace_versions where revision=(a->>'revision')::bigint)<>1 then raise exception 'revision not durable';end if;
 if has_function_privilege('anon','public.commit_account_workspace(bigint,jsonb)','execute') then raise exception 'anon execute';end if;
 if has_table_privilege('authenticated','public.account_workspaces','UPDATE') then raise exception 'direct write granted';end if;
end;$$;
do $$begin
 begin
  insert into public.account_workspaces(user_id,revision,payload) values(auth.uid(),999,'{"version":1,"records":{}}');
  raise exception 'direct insert unexpectedly succeeded';
 exception when insufficient_privilege then null;end;
end;$$;
-- Another identity cannot read the workspace, immutable history or media metadata.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated","is_anonymous":false}',true);
do $$begin
 if (select count(*) from public.account_workspaces)<>0 or (select count(*) from public.account_workspace_versions)<>0 then raise exception 'cross-account leak';end if;
 if (select count(*) from storage.objects where bucket_id='account-workspace-media')<>0 then raise exception 'cross-account media leak';end if;
end;$$;
set local role anon;
do $$begin
 begin
  perform public.commit_account_workspace(0,'{"version":1,"records":{}}');
  raise exception 'anonymous RPC unexpectedly succeeded';
 exception when insufficient_privilege then null;end;
 begin
  perform 1 from public.account_workspaces;
  raise exception 'anonymous SELECT unexpectedly succeeded';
 exception when insufficient_privilege then null;end;
end;$$;
rollback;
