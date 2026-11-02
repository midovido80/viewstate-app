-- A private profile is separate from Supabase Auth credentials.
-- Phone is contact information, NOT evidence of SMS verification.
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 150),
  phone text not null check (
    phone ~ '^\+?[0-9 ()-]{6,30}$'
    and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 6 and 15
  ),
  company text not null default '' check (char_length(company) <= 150),
  classification text not null check (classification in ('owner', 'broker', 'leasing_employee', 'real_estate_office', 'other')),
  other_classification text not null default '' check (char_length(other_classification) <= 100),
  constraint valid_other_classification check (
    (classification = 'other' and char_length(btrim(other_classification)) > 0)
    or (classification <> 'other' and other_classification = '')
  )
);

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;
revoke all on public.user_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.user_profiles to authenticated;

create policy own_profile_select on public.user_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy own_profile_insert on public.user_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy own_profile_update on public.user_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy own_profile_delete on public.user_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

comment on table public.user_profiles is
  'Private user-editable contact profile. Classification is descriptive, never an authorization role. No public profile directory.';
