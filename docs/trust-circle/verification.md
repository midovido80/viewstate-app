# Verification — 2026-11-11

Baseline: 0d9934bffb682688a5a35a58356aa79887dc6fcf.
Changes: lifecycle projection correction, regression tests, local 8-account/30-property integration test, design and E2E acceptance contract.

## Observed evidence

- New lifecycle regressions before correction: 7 passed, 4 failed; unavailable records appeared as direct matches through the adapter.
- Same adapter test file after correction: 11 passed, 0 failed.
- Focused adapter + broker service + notification + readiness tests: 31 passed, 0 failed.
- Entire mobile test script, executed with the same files through `node --import tsx --test`: 1030 passed, 0 failed.
- Existing domain validation test file completed successfully; existing domain matching suite: 29 passed, 0 failed.
- Property-domain TypeScript build: passed.
- Mobile TypeScript: passed.
- `git diff --check`: passed.

The fixture result and pair IDs are in `local-evidence.json`; it identifies its evidence as LOCAL_REPOSITORY_INTEGRATION_NOT_APP_E2E. Fixtures use fictional US 202-555-010x reserved example numbers, not real client phone data.

## Runtime limitations retained

`pnpm install --frozen-lockfile` resolved/downloaded the locked packages but returned nonzero under the environment's pnpm 11 build-approval policy (esbuild). Its automatically inserted unresolved `allowBuilds` placeholder was removed; no dependency, lockfile or repository build-permission policy was changed. The pnpm/tsx CLI runner subsequently failed to create its IPC socket in this environment. Tests were run successfully with the installed tsx module via Node's --import entry point, avoiding that CLI socket. This is not a claim that the normal pnpm install or CLI test command passed.

No CI result, Android/iOS device QA, browser E2E, hosted Supabase RLS test, production deployment, remote push notification or trust-circle app acceptance is claimed.

Supabase connection was confirmed during the session, but project-list/SQL/migration tools were not exposed in the available execution tool registry. No live project was read or mutated. Account tokens/credentials were never requested or inspected.

## Reproduce local checks

From `artifacts/mobile`, after installing the repository's locked dependencies with its supported pnpm toolchain:

```sh
node --import tsx --test tests/myPropertiesMatchingSource.test.ts tests/brokerInitiatedMatching.test.ts tests/matchNotifications.test.ts tests/trustCircleReadiness.test.ts
```

Use the existing workspace scripts for the full suite and TypeScript in an ordinary supported environment. The readiness fixture is included in the existing mobile test script. A passing fixture is not permission to enable production circle sharing.
