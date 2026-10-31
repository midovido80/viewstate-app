# Google account integration — onboarding and local isolation

Branch: `work/google-auth-isolation`. This package continues the infrastructure
checkpoint `19257773cc875383022acef7e5fe9ffadea0621f`.
It requires Founder acceptance of real sign-in and account switching before release.

## Services and configuration

Personal Supabase project `viewstate-app-pilot` (`taduvwcajtjpceavlxrc`), organization
`midovido80's Org`, region eu-central-1. Free plan only: no billing, paid SMS or
mail service. Google provider and the personal web callback were configured by the
Founder. Replit's read-only public Auth-settings request confirmed Google enabled,
phone and anonymous disabled. No credentials or privileged keys are in Git.

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the
intended environment. Both absent preserves the existing single-device development
mode; partial/invalid configuration fails closed. Configured mode never mounts the
application stores or routes before server-verified Google identity and onboarding.

Callbacks:
- Google Cloud: `https://taduvwcajtjpceavlxrc.supabase.co/auth/v1/callback`.
- Personal Replit: `https://ba95f458-c6a7-4139-b835-1c6ffdfeab2b-00-3ib2t2yj71ui5.expo.pike.replit.dev/auth/callback`.
- Future native binary: `viewstate://auth/callback` (must be allowlisted and tested).

## First-user journey

Google -> exact S256 PKCE callback -> online `getUser()` verification -> mandatory
contact profile -> animated ViewState welcome -> Home. Google verifies the Google
identity; this flow has no extra app password or redundant verification email.
Account selection is requested so the Founder can switch Google accounts.

Name, phone and classification are required. Company and local photo/default
avatar are optional. Roles: owner, broker, leasing employee, real-estate office,
other. Other requires a description. Arabic/Persian phone digits are normalized;
phone ownership is not verified by SMS. Invalid fields have red stars/errors and
scroll/focus to the first missing field. Save verifies the server's profile read-back.
Welcome supports Skip with double chevrons, a start action, per-owner completion,
and system/app reduced motion. Profile edits and sign-out are available in Settings.

Sharing adds a separate, initially unchecked contact-details option. Only explicit
consent includes name/phone/company/role in the reviewed share text. Email, avatar,
owner ID and internal app data are not added to this signature.

## Data boundary

- Reuses existing WebStore/SQLiteStore and domain validation.
- Immutable Supabase UUID scopes every local key, SQLite filename and media namespace.
- Screens, source/contact imports, global search, matching, follow-ups, notices,
  settings, capture drafts, enrichment/edit recovery and media use scoped resources.
- Capture draft queues and edit generations belong to their storage instance.
- Web locks protect recovery writes; owner-specific locks/keys do not collide.
- Native media are under `viewstate-users/<uuid>`, web blobs in a separate IndexedDB
  database. Native open/share/delete checks ownership. Temporary share archives use
  owner cache directories and random filenames.
- Sign-out/revocation synchronously closes the lease, hides app data, clears matching
  return memory and stops audio. Provider/query trees remount for the next lease;
  token refresh is reverified outside the SDK callback lock, and late results cannot publish through a revoked scope or write into another owner.
- Existing unowned trial records are preserved and never assigned to a login.
- Language is a device preference; account-specific language overrides still load
  from the owner's settings. No private business records live in that shared key.

The private cloud contact profile uses the already applied migration
`supabase/migrations/20261031122506_private_user_profiles.sql`: owner-only RLS for
select/insert/update/delete, no anonymous access. Existing SQL tests used actual
anon/authenticated roles and rolled back fixtures; foreign reads/writes/upserts and
owner reassignment are denied. Delete policy inspection is not a delete-operation test.
No new remote schema changes are part of this continuation.

## Verification and limits

Local Mobile tests: 865/865, including actual WebStore A/B properties/people/
requirements, settings, follow-ups, notices, auth session invalidation, scoped draft
save/clear/reload, independent recovery generations, owner media paths and opt-in
share signatures. Full workspace TypeScript, Domain/Matching and Android/iOS JS
exports passed during development. Re-run final checks on the committed revision.

The real profile component was exercised in an isolated 390px local QA harness in
English and Arabic: missing-field focus/errors, classification list, Other's required
text, and local acceptance of completed fields. The harness creates no login,
Supabase profile or business records and is not shipped in the application.

Still unverified: real Google callback round-trip, profile cloud save, logout/restart
and two real Google accounts on the personal HTTPS Preview; native browser/permissions/
SecureStore and signing/device compatibility. Fixture auth tests and JS exports do
not prove these. Property/people/media cloud synchronization, public account deletion
and final legal policies are pending. Local namespaces separate app usage; business
SQLite/AsyncStorage data are not an encrypted account vault.

## Personal Preview acceptance

1. Preserve the personal Replit checkpoint and its environment settings, fetch the
   published branch and check out the exact final SHA/tree. Do not overlay old app code.
2. Node 24.22.1, pnpm 10.26.1, frozen lockfile. Restart Expo with the existing approved
   public URL/key; never print tokens, the key, Google secret or auth callback codes.
3. Sign in as test user A. Verify missing-profile gate cannot be skipped by deep link,
   required fields and Other, save/read-back, welcome Skip/start and Home.
4. Add disposable Property/Person/Requirement/draft/media/follow-up/notice as A.
   Verify signature off/on in preview without sending a message externally.
5. Sign out; app data must disappear. Sign in B: none of A's records, drafts, media,
   settings, notices or matching appear. Direct A record routes must reveal nothing.
6. Create B records, return to A and reload: each account retains only its own data.
   Test canceled login, failed network/profile save, repeated presses, expiry and a
   save in flight at logout. No stale UI or old-owner result may return.
7. Check English/Arabic RTL, scroll, Back, tabs and existing property form journeys.
   Report actual evidence and failures, not inferred success.

## Recovery and release boundary

Keep the infrastructure parent `19257773...` and the accepted pre-auth UI
`8d62f82d...` reachable. Reverting source/Preview restores its previous behavior;
new per-user records are not merged into legacy data and remain separate. Git
rollback does not remove Supabase tables or auth users. No data deletion is needed.

No main/Pilot movement, company Replit changes, publication, APK, signing or Expo
ownership transfer is included. The company-linked Expo owner requires its own review.
