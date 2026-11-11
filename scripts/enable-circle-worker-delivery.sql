-- Operator bootstrap for the isolated Pilot only. Run after application migrations.
-- Create circle_worker_url and circle_worker_secret in Vault before running.
begin;
create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if (select count(distinct name) from vault.decrypted_secrets
      where name in ('circle_worker_url', 'circle_worker_secret')
        and coalesce(decrypted_secret,'') <> '') <> 2 then
    raise exception 'Create circle_worker_url and circle_worker_secret in Vault first';
  end if;
end $$;

create or replace function viewstate_circle.wake_delivery_worker() returns void
language plpgsql security definer set search_path='' as $$
declare target text; credential text;
begin
  select decrypted_secret into strict target from vault.decrypted_secrets where name='circle_worker_url';
  select decrypted_secret into strict credential from vault.decrypted_secrets where name='circle_worker_secret';
  if target !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/circle-match-worker$' then
    raise exception 'Invalid circle worker URL';
  end if;
  perform net.http_post(url:=target, body:='{}'::jsonb, timeout_milliseconds:=10000,
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential));
end $$;
revoke all on function viewstate_circle.wake_delivery_worker() from public,anon,authenticated,service_role;

create or replace function viewstate_circle.wake_delivery_worker_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform viewstate_circle.wake_delivery_worker();
  return null;
exception when others then
  -- The durable queue remains authoritative. Cron wakes up missed events.
  raise warning 'Circle worker wake-up failed';
  return null;
end $$;
revoke all on function viewstate_circle.wake_delivery_worker_trigger() from public,anon,authenticated,service_role;

drop trigger if exists circle_delivery_webhook on viewstate_circle.change_queue;
create trigger circle_delivery_webhook after insert on viewstate_circle.change_queue
for each statement execute function viewstate_circle.wake_delivery_worker_trigger();

select cron.schedule('viewstate-circle-delivery-retry', '* * * * *',
  'select viewstate_circle.wake_delivery_worker()');
commit;
