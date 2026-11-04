create or replace function public.commit_account_workspace(expected_revision bigint,next_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); current_row public.account_workspaces; next_revision bigint;
begin
 if owner_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'authentication required' using errcode='42501';end if;
 if expected_revision is null or expected_revision<0 or next_payload is null or jsonb_typeof(next_payload)<>'object' or next_payload->>'version' is distinct from '1' or jsonb_typeof(next_payload->'records') is distinct from 'object' or pg_column_size(next_payload)>16777216 then raise exception 'invalid workspace' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(next_payload->'records') as e where (length(e.key)>520 or e.key !~ '^(property|person|requirement|link|source|task|availability|contact|dismissed)/.+$') or jsonb_typeof(e.value) not in ('object','boolean')) then raise exception 'invalid record' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
 select * into current_row from public.account_workspaces where user_id=owner_id for update;
 if coalesce(current_row.revision,0)<>expected_revision then return jsonb_build_object('accepted',false,'revision',coalesce(current_row.revision,0),'payload',coalesce(current_row.payload,'{"version":1,"records":{}}'::jsonb));end if;
 if current_row.payload=next_payload then return jsonb_build_object('accepted',true,'revision',current_row.revision,'payload',current_row.payload);end if;
 next_revision:=expected_revision+1;
 insert into public.account_workspace_versions(user_id,revision,payload) values(owner_id,next_revision,jsonb_build_object('version',1,'base_revision',expected_revision,'changes',coalesce((select jsonb_object_agg(e.key,e.value) from jsonb_each(next_payload->'records') e where (current_row.payload->'records'->e.key) is distinct from e.value),'{}'::jsonb),'deleted',coalesce((select jsonb_agg(e.key) from jsonb_object_keys(coalesce(current_row.payload->'records','{}'::jsonb)) e(key) where not (next_payload->'records' ? e.key)),'[]'::jsonb)));
 insert into public.account_workspaces(user_id,revision,payload) values(owner_id,next_revision,next_payload)
 on conflict(user_id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=now();
 return jsonb_build_object('accepted',true,'revision',next_revision,'payload',next_payload);
end;$$;
