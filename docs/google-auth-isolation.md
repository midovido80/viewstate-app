# Google account integration — foundation checkpoint

This work is on `work/google-auth-isolation`, based on
`8d62f82d684de276fdff5c569b4d55e0a558983f`. It is not an accepted authentication release.

## Provisioned service

- Organization: `midovido80's Org` (`fbvewlwzjvobtjxqqppr`).
- Project: `viewstate-app-pilot` (`taduvwcajtjpceavlxrc`).
- Region: `eu-central-1`.
- Quoted project cost: $0/month on the existing Free plan. No paid service was requested.
- No application secrets or service-role keys are committed.

## Applied and verified

`supabase/migrations/20261031122506_private_user_profiles.sql` creates a private,
owner-scoped profile with required name, contact phone and classification; company
is optional. Choosing `other` requires a description. Phone is not SMS verified.
Classification is descriptive and grants no privileges. There are no public-read
policies, authorization metadata, security-definer functions or auth signup triggers.
The migration was created with temporary Supabase CLI 2.122.0, without adding a
project dependency or changing the lockfile, then applied through the Supabase tool.

`supabase/tests/private_user_profiles.sql` passed against the new project under
the actual `authenticated` and `anon` database roles. It verifies own read/insert/
update, rejection of foreign inserts/upserts and ownership reassignment, hidden
foreign rows, rejection of foreign updates, required-field constraints, and denied
anonymous reads/inserts. Fixture users and profiles are transactionally rolled back.
These are SQL ownership tests, not a Google sign-in or device-authentication test.
Delete policies were inspected but delete operations were not executed: an earlier
test including deletes hit an expired tool confirmation and did not run. The
non-deleting version is the test retained here. The security advisor reported no
findings after the migration.

## Not enabled yet

- Google provider, Google OAuth client and consent screen.
- App SDK/session storage, redirect allowlist and callback verification.
- Required-profile screen, sign-out and account switching.
- Isolation of existing Properties, People, Requirements, local media, assistant,
  match notices, settings and in-memory caches by authenticated user.
- Cloud synchronization or upload of property/media data.

The existing application still uses device-global local stores. Do not expose it
as a multi-user authenticated app until the entire data boundary and switch tests
are implemented. Do not attach legacy unowned trial data to the first signed-in user.
The private profile table alone does not isolate the existing application data.

## Continuation

The Supabase connector can manage the project but cannot configure Google OAuth.
The dashboard browser is at a sign-in wall. Authenticate to the approved Supabase
organization, then configure a dedicated Google OAuth client in the intended Google
Cloud project (no billing or SMS). Keep the Google client secret in Supabase provider
configuration only, never Git or chat. Request only identity/email/profile scopes.

Use Google sign-in without a separate app password or redundant verification email.
Use a checked server identity rather than editable metadata for ownership. Implement
both native PKCE and exact web callbacks; do not accept arbitrary callback URLs.
Keep auth disabled in existing previews until ownership guards, account switching,
deep-link protection and cache/media isolation are verified. Publishable keys may
be shipped in the app only with the complete RLS boundary in place; privileged keys
must never be shipped. No email/password or paid SMS provider is part of this stage.

Before acceptance, test user A versus user B (including direct API access, forged
owner IDs, sign-out/restart, expired sessions and in-flight saves during switching),
then run the relevant Mobile/Domain/type checks, CI on the same commit, and native
verification. Neither the existing company/personal Preview nor main/Pilot has
been switched by this checkpoint.

## Recovery

The base commit remains the original app. This checkpoint changes no runtime app
source or dependencies, so returning a checkout to that base needs no data rewrite.
The new Supabase table is independent and unused by existing previews; reverting
Git does not automatically remove remote database migrations. Keep the project
and table intact while the package is incomplete. Any later removal of remote
resources is a separate explicit action. Do not promise zero regressions for the
future auth integration; acceptance requires the tests above.

## Official references consulted

- https://supabase.com/changelog.md
- https://supabase.com/changelog/cbc-tls-ciphers-deprecated
- https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-sign-in
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/database/postgres/row-level-security
