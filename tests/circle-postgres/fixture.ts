import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export async function circleFixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, aud text, role text, created_at timestamptz default now(),
      phone text, phone_confirmed_at timestamptz, is_anonymous boolean default false,
      email text, email_confirmed_at timestamptz, raw_app_meta_data jsonb default '{}'::jsonb,
      raw_user_meta_data jsonb default '{}'::jsonb);
    create table auth.identities(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id),
      provider text, identity_data jsonb);
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
    create schema storage;
    create table storage.buckets(id text, name text, public boolean, file_size_limit bigint);
    create table storage.objects(bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
  `);
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  }
  return db;
}

export function asCircleUser<T>(
  db: PGlite,
  user: string,
  work: (tx: Pick<PGlite, "query">) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: user, role: "authenticated", is_anonymous: false }),
    ]);
    await tx.exec("set local role authenticated");
    return work(tx);
  });
}
