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

## Account infrastructure implemented (not activated in the app)

- Pinned `@supabase/supabase-js` 2.118.0, `expo-secure-store` 15.0.8 (Expo 54's
  compatible version), and `react-native-url-polyfill` 3.0.0. The lockfile has only
  the intended additions, with no existing-version upgrades.
- The new SDK requires Node >=22. The internal EAS profile is pinned to Node
  24.22.1, matching the verified development runtime, instead of its old Node
  20.19.4. No EAS build was submitted; the remote worker remains unverified.
- `googleAccountService.ts`: Google OAuth with S256 PKCE, exact callback validation,
  server `getUser()` verification instead of trusting a stored session, required
  private-profile validation/save/read-back, and revocable data leases. Native uses
  the SDK-returned flow ID; web uses one flow per sessionStorage namespace. The SDK's
  experimental callback-flow flag is not enabled. Optional callback flow IDs are
  validated and, when a native expected flow ID is available, must match it.
- `googleAccountDevice.ts`: explicit, lazy construction; publishable-key-only
  configuration; HTTPS web callbacks; native system browser; OS-backed native
  session storage and crypto. Plain PKCE authorization URLs are rejected. Tokens
  are not stored in application AsyncStorage. Browser sessions use sessionStorage.
- `secureSessionStorage.ts`: bounded Unicode-safe chunks below the native item
  size limit, manifest commit after writing pieces, queued replacement/removal,
  preservation of the previous session on failure, and fail-closed reads.
- `accountScope.ts` and `accountRepositories*.ts`: immutable per-owner keys, native
  SQLite filename, media namespace names, the existing WebStore/SQLiteStore and
  settings/assistant/notification repositories. Stale/in-flight operations cannot
  publish results through a revoked lease or write into a different owner's namespace.
- Native configuration retains the old `mobile` scheme and adds `viewstate`, plus
  the SecureStore configuration plugin. These take effect in a future native build;
  an existing installed APK does not gain native modules or schemes by Preview update.
- 27 focused tests passed, including real WebStore separation of Properties, People
  and canonical Requirements and their reload, plus settings/assistant/notices and
  actual pinned-SDK S256 authorization URL generation. Unit auth ports are fixtures;
  they are not a claim that a real Google account has signed in.
- Final local validation: 858/858 Mobile tests, full-workspace TypeScript checks,
  Property Domain and Matching tests, frozen-lockfile installation, whitespace
  checks and Android/iOS JavaScript exports passed. The existing root still
  does not import the new services, so exports do not prove native authentication.

## Not enabled yet / acceptance blockers

- Google provider, Google OAuth client and consent screen.
- Redirect allowlist, callback route, and activation of the new SDK/session boundary
  in the application root. The implemented services are not imported by the live root.
- Required-profile screen, sign-out and account switching.
- Connecting every existing Properties/People/Requirements UI consumer, capture
  draft/recovery helper, media factory, assistant, match-notice provider, settings
  provider and in-memory/query cache to the new per-account resources. The factories
  and their tests do not retroactively isolate the current global application stores.
- Cloud synchronization or upload of property/media data.

The existing application still uses device-global local stores. Do not expose it
as a multi-user authenticated app until the entire data boundary and switch tests
are implemented. Do not attach legacy unowned trial data to the first signed-in user.
The private profile table alone does not isolate the existing application data.

## Continuation

The Supabase connector can manage the project but cannot configure Google OAuth.
The Founder has verified the correct organization and project in their own browser.
The separate automation browser is signed into another organization's dashboard and
does not expose the approved project. Do not create a replacement project there.
The project's public `/auth/v1/settings` was checked on 2026-10-31: `google: false`,
`phone: false`, `anonymous_users: false`. No Google client ID or secret is available
through the existing connector. Configure a dedicated Google OAuth client in the intended Google
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

The base commit remains the original app. This package adds unused infrastructure,
pinned dependencies and native configuration, and does not switch any runtime UI
consumer to authenticated storage. Returning to the base needs no data rewrite.
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
