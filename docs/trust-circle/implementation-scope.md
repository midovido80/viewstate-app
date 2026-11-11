# Trust-circle readiness and lifecycle correction

Baseline: 0d9934bffb682688a5a35a58356aa79887dc6fcf.
Request: 2026-11-11; one circle, eight brokers and thirty properties.

## Authorized bounded work

Investigate and correct the lifecycle projection defect; execute an isolated eight-account/thirty-property test using the existing persisted repositories and real matching engine; specify the missing server integration and its acceptance contract. No production migration, real invitations, credential changes or main/pilot advancement is included.

## Acceptance

- First reproduce rented/paused/sold properties incorrectly qualifying through the candidate adapter.
- Preserve only the two existing lifecycle fields in the candidate projection; do not introduce a schema migration, alter ranking or disclose additional private fields.
- Verify unavailable properties are excluded, available/legacy properties continue matching, and status changes are respected by fresh matching runs.
- Persist and reopen thirty fictional properties in eight independent WebStore namespaces; local runs must never read another namespace.
- Test-only explicit aggregate source demonstrates the existing engine's behavior against the combined catalog. It is NOT authorization, shared-cloud implementation or application end-to-end acceptance.
- Report exact positive pairs and actual evaluated counts, not invented scores or prefilled UI results.
- Never treat a mock membership map, local notification reconciliation or a positive matcher test as proof of RLS, server scheduling, push delivery or actual application screens.

## Required later production stages

1. Add normalized circle memberships and server-enforced shared projections beside the unchanged private workspaces.
2. Implement authenticated share/update/withdraw RPCs and revision-safe publication from mobile.
3. Add private requirement publication, server worker/outbox and recipient-specific notifications.
4. Wire circle navigation, matching source and notification history in the existing app.
5. Deploy to isolated test infrastructure; run eight authenticated users through actual screens, authorization denials, lifecycle edits and delivery tests.

## Regression and rollback

Run adapter/service/domain tests, mobile suite and mobile/domain typechecks when dependencies permit. Revert the adapter change to roll back; no data migration exists. Existing datasets and frozen branches stay intact. This package does not mark the trust-circle feature complete or frozen.
