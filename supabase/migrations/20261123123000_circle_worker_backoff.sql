alter table viewstate_circle.circles
  add column worker_attempts integer not null default 0 check (worker_attempts between 0 and 10),
  add column worker_retry_at timestamptz not null default now(),
  add column worker_claim_id uuid;

drop function public.vs_circle_worker_jobs();
create function public.vs_circle_worker_jobs() returns table(circle_id uuid,claim_id uuid)
language sql volatile security definer set search_path='' as $$
  with picked as (
    select c.id from viewstate_circle.circles c
    where c.worker_retry_at<=now()
      and exists(select 1 from viewstate_circle.change_queue q where q.circle_id=c.id)
    order by (select min(q.created_at) from viewstate_circle.change_queue q where q.circle_id=c.id), c.id
    limit 5 for update of c skip locked
  )
  update viewstate_circle.circles c
  set worker_attempts=least(c.worker_attempts+1,10),worker_retry_at=now()+interval '2 minutes',worker_claim_id=gen_random_uuid()
  from picked where c.id=picked.id returning c.id,c.worker_claim_id
$$;

create function public.vs_circle_worker_retry(p_circle uuid,p_claim uuid) returns void
language sql security definer set search_path='' as $$
  update viewstate_circle.circles c
  set worker_retry_at=now()+make_interval(secs=>least(3600,30*power(2,greatest(c.worker_attempts-1,0)))::double precision)
  where c.id=p_circle and c.worker_claim_id=p_claim
$$;

create function public.vs_circle_worker_complete(p_circle uuid,p_revision bigint,p_claim uuid) returns void
language sql security definer set search_path='' as $$
  update viewstate_circle.circles c set worker_attempts=0,worker_retry_at=now(),worker_claim_id=null
  where c.id=p_circle and c.revision=p_revision and c.worker_claim_id=p_claim
    and not exists(select 1 from viewstate_circle.change_queue q where q.circle_id=c.id)
$$;

revoke all on function public.vs_circle_worker_jobs(),public.vs_circle_worker_retry(uuid,uuid),public.vs_circle_worker_complete(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.vs_circle_worker_jobs(),public.vs_circle_worker_retry(uuid,uuid),public.vs_circle_worker_complete(uuid,bigint,uuid) to service_role;
