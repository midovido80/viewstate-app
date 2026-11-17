-- Run against a disposable/development project as the database owner.
-- All fixture accounts and rows are rolled back; no real sign-in is simulated.
begin;
insert into auth.users (id, aud, role) values
  ('1d68ee91-b823-4ab1-b164-39bf2939f3a1', 'authenticated', 'authenticated'),
  ('1d68ee91-b823-4ab1-b164-39bf2939f3b2', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d68ee91-b823-4ab1-b164-39bf2939f3a1","role":"authenticated"}', true);
insert into public.user_profiles (user_id, display_name, phone, classification)
values ('1d68ee91-b823-4ab1-b164-39bf2939f3a1', 'RLS fixture A', '+965 5555 0101', 'broker');

do $$
begin
  if (select count(*) from public.user_profiles) <> 1 then raise exception 'Own profile missing'; end if;
  begin
    insert into public.user_profiles (user_id, display_name, phone, classification)
    values ('1d68ee91-b823-4ab1-b164-39bf2939f3b2', 'Forbidden', '+965 5555 0102', 'owner');
    raise exception 'Cross-owner insert was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.user_profiles set user_id = '1d68ee91-b823-4ab1-b164-39bf2939f3b2';
    raise exception 'Ownership reassignment was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.user_profiles set display_name = ' ';
    raise exception 'Blank name was allowed';
  exception when check_violation then null;
  end;
  begin
    update public.user_profiles set phone = '------';
    raise exception 'Invalid contact phone was allowed';
  exception when check_violation then null;
  end;
  begin
    update public.user_profiles set classification = 'other', other_classification = '';
    raise exception 'Empty custom classification was allowed';
  exception when check_violation then null;
  end;
end $$;
update public.user_profiles set display_name = 'Updated own profile'
where user_id = '1d68ee91-b823-4ab1-b164-39bf2939f3a1';

select set_config('request.jwt.claims', '{"sub":"1d68ee91-b823-4ab1-b164-39bf2939f3b2","role":"authenticated"}', true);
insert into public.user_profiles (user_id, display_name, phone, classification, other_classification)
values ('1d68ee91-b823-4ab1-b164-39bf2939f3b2', 'RLS fixture B', '+965 5555 0102', 'other', 'Test description');

do $$
declare affected integer;
begin
  if (select count(*) from public.user_profiles) <> 1 then raise exception 'Cross-owner read exposed a row'; end if;
  if exists (select 1 from public.user_profiles where display_name = 'Updated own profile') then
    raise exception 'User B can read user A';
  end if;
  update public.user_profiles set display_name = 'Forbidden'
  where user_id = '1d68ee91-b823-4ab1-b164-39bf2939f3a1';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-owner update was allowed'; end if;
  begin
    insert into public.user_profiles (user_id, display_name, phone, classification)
    values ('1d68ee91-b823-4ab1-b164-39bf2939f3a1', 'Forbidden', '+965 5555 0101', 'broker')
    on conflict (user_id) do update set display_name = excluded.display_name;
    raise exception 'Cross-owner upsert was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"1d68ee91-b823-4ab1-b164-39bf2939f3a1","role":"authenticated"}', true);
do $$
begin
  if (select display_name from public.user_profiles) is distinct from 'Updated own profile' then
    raise exception 'Own update was lost or another account was exposed';
  end if;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform * from public.user_profiles;
    raise exception 'Anonymous profile read was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_profiles (user_id, display_name, phone, classification)
    values ('1d68ee91-b823-4ab1-b164-39bf2939f3a1', 'Forbidden', '+965 5555 0101', 'broker');
    raise exception 'Anonymous insert was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'PASS: private profile read/insert/update/upsert, ownership, validation and anonymous-denial checks; fixtures rolled back. Delete not exercised.' as result;
