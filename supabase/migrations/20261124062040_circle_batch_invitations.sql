create table viewstate_circle.invite_batches (
 user_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null,
 circle_id uuid not null references viewstate_circle.circles(id) on delete cascade,
 phones text[] not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,operation_id)
);
alter table viewstate_circle.invite_batches enable row level security;
revoke all on viewstate_circle.invite_batches from public,anon,authenticated;
create index circle_invite_batches_owner_created on viewstate_circle.invite_batches(user_id,created_at);

create function public.vs_circle_invite_batch(p_circle uuid,p_operation uuid,p_phones text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=viewstate_circle.require_member(p_circle); canonical text[]; saved viewstate_circle.invite_batches;
 item text; outcome jsonb; results jsonb:='[]'::jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(who::text,42));
 perform 1 from viewstate_circle.circles where id=p_circle and owner_id=who for update;
 if not found then raise exception 'CIRCLE_OWNER_REQUIRED' using errcode='42501'; end if;
 if p_operation is null or p_phones is null or cardinality(p_phones) not between 1 and 50
   or array_ndims(p_phones)<>1
   or exists(select 1 from unnest(p_phones) p where p is null or p !~ '^\+[1-9][0-9]{6,14}$') then
  raise exception 'CIRCLE_INVITE_BATCH_INVALID' using errcode='22023';
 end if;
 select array_agg(distinct p order by p) into canonical from unnest(p_phones) p;
 select * into saved from viewstate_circle.invite_batches where user_id=who and operation_id=p_operation;
 if found then
  if saved.circle_id is distinct from p_circle or saved.phones is distinct from canonical then
   raise exception 'CIRCLE_INVITE_BATCH_CHANGED' using errcode='22023';
  end if;
  return saved.result;
 end if;
 if (select count(*) from viewstate_circle.invite_batches where user_id=who and created_at>now()-interval '1 day')>=200 then
  raise exception 'CIRCLE_INVITE_BATCH_LIMIT' using errcode='22023';
 end if;
 foreach item in array canonical loop
  outcome:=public.vs_circle_invite_phone(p_circle,item);
  results:=results||jsonb_build_array(jsonb_build_object('phone',item,'status',outcome->>'status'));
 end loop;
 outcome:=jsonb_build_object('results',results);
 insert into viewstate_circle.invite_batches(user_id,operation_id,circle_id,phones,result)
 values(who,p_operation,p_circle,canonical,outcome);
 return outcome;
end $$;
revoke all on function public.vs_circle_invite_batch(uuid,uuid,text[]) from public,anon;
grant execute on function public.vs_circle_invite_batch(uuid,uuid,text[]) to authenticated;
