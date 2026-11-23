alter table viewstate_circle.push_devices add column revoke_hash bytea;

create table viewstate_circle.push_capabilities (
  token text not null,
  revoke_hash bytea not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  revoked boolean not null default false,
  primary key(token,revoke_hash)
);
alter table viewstate_circle.push_capabilities enable row level security;
revoke all on viewstate_circle.push_capabilities from public,anon,authenticated;
create index push_capabilities_user on viewstate_circle.push_capabilities(user_id);

-- Activation is sent only after preparation succeeds; an ambiguous preparation cannot activate a device.
create function public.vs_circle_prepare_push_device(p_token text,p_secret text) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor();
begin
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,128}\]$'
    or p_secret is null or p_secret !~ '^[a-f0-9]{64}$' then
    raise exception 'CIRCLE_PUSH_TOKEN_INVALID' using errcode='22023';
  end if;
  insert into viewstate_circle.push_capabilities(token,revoke_hash,user_id)
    values(p_token,sha256(convert_to(p_secret,'UTF8')),who)
    on conflict(token,revoke_hash) do nothing;
end $$;

create function public.vs_circle_register_push_device(p_token text,p_secret text) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor();
begin
  perform 1 from viewstate_circle.push_capabilities
    where token=p_token and revoke_hash=sha256(convert_to(p_secret,'UTF8')) and user_id=who and not revoked
    for update;
  if not found then raise exception 'CIRCLE_PUSH_CAPABILITY_REVOKED' using errcode='42501'; end if;
  insert into viewstate_circle.push_devices(token,user_id,revoke_hash)
    values(p_token,who,sha256(convert_to(p_secret,'UTF8')))
  on conflict(token) do update set user_id=excluded.user_id,revoke_hash=excluded.revoke_hash,updated_at=now();
end $$;

-- Anonymous callers can revoke issued capabilities, never create rows or reactivate one.
create function public.vs_circle_revoke_push_device(p_token text,p_secret text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,128}\]$'
    or p_secret is null or p_secret !~ '^[a-f0-9]{64}$' then
    raise exception 'CIRCLE_PUSH_TOKEN_INVALID' using errcode='22023';
  end if;
  update viewstate_circle.push_capabilities set revoked=true
    where token=p_token and revoke_hash=sha256(convert_to(p_secret,'UTF8')) and not revoked;
  delete from viewstate_circle.push_devices
    where token=p_token and revoke_hash=sha256(convert_to(p_secret,'UTF8'));
end $$;

create or replace function public.vs_circle_register_push(p_token text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid := viewstate_circle.actor();
begin
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,128}\]$' or p_enabled is null then
    raise exception 'CIRCLE_PUSH_TOKEN_INVALID' using errcode='22023';
  end if;
  if p_enabled then
    insert into viewstate_circle.push_devices(token,user_id) values(p_token,who)
    on conflict(token) do update set user_id=excluded.user_id,revoke_hash=null,updated_at=now()
    where push_devices.user_id<>excluded.user_id and push_devices.revoke_hash is null;
  else
    delete from viewstate_circle.push_devices where user_id=who and token=p_token and revoke_hash is null;
  end if;
end $$;

revoke all on function public.vs_circle_prepare_push_device(text,text),public.vs_circle_register_push_device(text,text) from public,anon,authenticated;
grant execute on function public.vs_circle_prepare_push_device(text,text),public.vs_circle_register_push_device(text,text) to authenticated;
revoke all on function public.vs_circle_revoke_push_device(text,text) from public,anon,authenticated;
grant execute on function public.vs_circle_revoke_push_device(text,text) to anon,authenticated;
