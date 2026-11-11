# Server stage 01 — membership and shared inventory

Founder request: 2026-11-11. Code branch: feature/trust-circle-server-20261111, based on readiness commit b9a765ce7a639c4907ab0d2ae99ba841bce61302 (PR #56 remains separate).

## Implemented and deployed

Supabase project: viewstate-app-pilot / taduvwcajtjpceavlxrc. Migration ledger: 20261111083559_circle_membership_inventory.

The viewstate_circle schema contains circles, members, properties and change_queue with RLS. Public vs_circle_* RPCs implement owner-created circles, explicit invitations/acceptance, owner-only revocation, owner-bound publication/withdrawal, revision conflicts, replay checks and circle-scoped catalog/list/invitation reads. The internal schema is not added to the exposed REST schemas. Direct client writes are denied; RPCs derive the actor from auth.uid(). No private workspace is read by this feature.

The data allowlist is deliberately limited to apartment rentals in KWD: area ID, price/period, subtype, counts, selected booleans and furnishing, plus lifecycle fields. Unsupported fields/types are rejected, not silently uploaded. Photos, source details, exact coordinates, private notes and customer contacts are not shared by this stage. Extending this allowlist is a separate compatibility task before wider property-type rollout.

CircleMatchingSource adapts authorized RPC rows for the existing engine, using server publication UUIDs so equal local IDs from separate accounts do not collide. It is not yet connected to application screens. A new source is required per matching run; failed membership/catalog loads do not fall back to private or broader inventory.

## Isolation and deployment decision

Supabase development branch creation returned PaymentRequiredException: Pro is required. No plan or billing settings were changed. A separately namespaced, additive schema was applied to the existing project under the authorized server-inventory task. This is NOT a separate database branch: the same database serves old and new APIs. Existing tables/functions and all six private public-schema RLS policies remained unchanged (compared before/after migration). No app code was merged or deployed. The current released app has no callers for the new APIs.

## Verification

- Disposable local PostgreSQL (PGlite) executed the actual migration, SQL roles/RLS/RPCs and existing TypeScript matcher: eight broker identities, one outsider, thirty shared rows and thirty independently expected cross-broker pairs.
- Hosted PostgreSQL executed supabase/tests/circles/live_transaction.sql: eight broker fixtures, one outsider, thirty publications, eight authorized catalog reads and fourteen expected denials. Checks cover pending/outside/revoked access, direct writes, private-field rejection, stale revision, withdrawal and publisher removal.
- All hosted auth-row/circle/property/queue fixtures were rolled back inside a controlled subtransaction before success was returned. A separate query confirmed all four new tables empty, existing user_profiles still two, private workspace rows still zero. No real user was invited or messaged.
- The hosted catalog snapshot was fed to the actual matcher locally and produced thirty expected pairs. The matcher did NOT execute as a hosted worker; there is no server scheduling claim.
- Entire mobile suite: 1031 tests passed. Mobile TypeScript, local database integration and whitespace checks passed (see the branch report).

Auth claims in SQL tests are injected as fixture session settings while the effective role is authenticated. This exercises real database permissions, not token signature verification, Google sign-in, PostgREST routing, UI or device E2E. Hosted evidence is in hosted-stage01-evidence.json. Fixture UUIDs identify rolled-back test rows only.

## Security advisor interpretation

The change queue is intentionally server-only, with RLS and no client privileges/policies. Its informational no-policy notice is expected. Four new write RPCs intentionally use SECURITY DEFINER, empty search_path, server-derived actor IDs and explicit authorization, while direct table writes are revoked. Supabase flags those authenticated RPCs for review; the local/hosted denial tests are evidence for the intended privilege boundary, not a blanket security certification.

Advisor references:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

The existing leaked-password-protection warning and workspace RPC warning were not changed. No Auth settings were modified.

## Remaining stages

Durable device-side publication intents and save/edit/delete integration; matching screen/source/detail routing; scoped requirement publication; hosted worker and dual-recipient notification/outbox/retry pipeline; push registration/delivery; eight actual login sessions and Android foreground/background/closed-app E2E. change_queue is a durable recomputation intent only; it has no consumer yet.

## Rollback

Keep the app on its previous branch/build; no released flow calls the new APIs. If disabling backend access becomes necessary, revoke only the new RPC execute grants in a reviewed migration. Do not drop shared or private user data as an app rollback. A GitHub branch alone does not roll back a database migration.

## Reproduce local database checks

Install the normal workspace using its supported pnpm toolchain. Install the development-only harness separately:

```sh
pnpm --dir tests/circle-postgres install --ignore-workspace --frozen-lockfile --ignore-scripts
```

From artifacts/mobile:

```sh
node --import tsx --test ../../tests/circle-postgres/circleDatabase.test.ts
```

The PGlite dependency is isolated from the application workspace; its original lockfile/dependency graph is unchanged. CI runs this separate database gate. No hosted/device test is implied by CI success.
