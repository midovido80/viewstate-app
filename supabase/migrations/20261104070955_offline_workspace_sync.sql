-- Additive private sync store. Local business repositories remain the primary write path.
create table public.account_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null check(revision>0),
 payload jsonb not null check(jsonb_typeof(payload)='object' and payload->>'version'='1' and jsonb_typeof(payload->'records')='object'),
 updated_at timestamptz not null default now()
);
create table public.account_workspace_versions (
 user_id uuid not null references auth.users(id) on delete cascade,
 revision bigint not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,revision)
);
alter table public.account_workspaces enable row level security;
alter table public.account_workspaces force row level security;
alter table public.account_workspace_versions enable row level security;
alter table public.account_workspace_versions force row level security;
revoke all on public.account_workspaces,public.account_workspace_versions from public,anon,authenticated;
grant select on public.account_workspaces,public.account_workspace_versions to authenticated;
create policy workspace_owner_read on public.account_workspaces for select to authenticated using ((select auth.uid())=user_id);
create policy workspace_version_owner_read on public.account_workspace_versions for select to authenticated using ((select auth.uid())=user_id);

-- Definer is necessary to deny direct table writes; caller identity is never a parameter.
create function public.commit_account_workspace(expected_revision bigint,next_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); current_row public.account_workspaces; next_revision bigint;
begin
 if owner_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'authentication required' using errcode='42501';end if;
 if expected_revision is null or expected_revision<0 or next_payload is null or jsonb_typeof(next_payload)<>'object' or next_payload->>'version' is distinct from '1' or jsonb_typeof(next_payload->'records') is distinct from 'object' or pg_column_size(next_payload)>16777216 then raise exception 'invalid workspace' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(next_payload->'records') as e where e.key !~ '^(property|person|requirement|link|source|task|availability|contact|dismissed)/.{1,500}$' or jsonb_typeof(e.value) not in ('object','boolean')) then raise exception 'invalid record' using errcode='22023';end if;
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
revoke all on function public.commit_account_workspace(bigint,jsonb) from public,anon;
grant execute on function public.commit_account_workspace(bigint,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('account-workspace-media','account-workspace-media',false,52428800);
-- Immutable content-addressed blobs, scoped by authenticated owner. No public links and no overwrites.
create policy workspace_media_read on storage.objects for select to authenticated using (bucket_id='account-workspace-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy workspace_media_insert on storage.objects for insert to authenticated with check (bucket_id='account-workspace-media' and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$');
comment on table public.account_workspace_versions is 'Private immutable sync revisions retained for conflict recovery. No client DELETE privilege.';
