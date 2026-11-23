# Property status and permanent deletion — ViewState Next

Scope: `work/viewstate-next-20261107`, based on the message-import release `a27cb39`.

## Behavior

- Property detail exposes **Change property status** and a separate red **Delete property permanently** action.
- Rental offers can be available, rented, or paused. Sale offers can be available, sold, or paused. Resuming marketing is explicit and restores availability.
- Existing records default to active unless their existing rental-availability field says rented. Status persists through the original property editor and workspace snapshots.
- The original domain matching eligibility gate rejects paused/sold/rented offers. Cards and detail show the corresponding text and status color.
- Permanent deletion requires confirmation identifying type, area, and record ID. Cancel has no side effect. A stale confirmation or unfinished save/edit recovery does not silently delete a changed property or its draft.
- SQLite deletes the exact record, its source and person-property links, and writes an ID-only deletion fence in the same transaction. Browser single-record deletion uses the existing exclusive-lock/CAS/verified workspace journal. Browser bulk deletion remains unsupported.
- People, their contact information, and client requests are retained. Property-linked follow-ups, availability confirmations, and match notices are cleaned; unrelated work is preserved.

## Offline and files

- An ID-only tombstone uses the existing `property/<id>` workspace record with `{ "version": 1, "deleted": true }`. It fits the current cloud payload contract; no database migration or remote account change is required.
- Tombstones survive store reloads and first synchronization, win over stale property edits, and prune property-owned links/source/tasks during the three-way merge. Local store replacement cannot remove an existing deletion fence to reintroduce that ID.
- Write failures are reported as failures, not successful deletion. The browser workspace journal either commits all affected arrays/fence or recovers the prior snapshot.
- Local owned-file URIs are durably queued before metadata is deleted, including when deletion arrives from another device. Cleanup runs under the account writer lock, after deletion, and retries on next launch/sync. Media still referenced by another live record or the original import inbox is retained.
- Deletion removes the listing from the live workspace. It does **not** claim cryptographic erasure of historical server snapshots, external/shared copies, or unreferenced content-addressed cloud media. Existing server-history retention and a future cloud-media garbage-collection policy remain separate concerns.
- All devices using an account should update to this version. Earlier clients do not understand the tombstone shape and may stop synchronization with a validation error until updated; the new client does not accept resurrection.

## Verification

- Real WebStore and SQLite (in-memory SQLite database): exact deletion, source/link cleanup, preservation of people and requirements, persistent fences, stale-save rejection, and refusing resurrection through snapshot replacement.
- Browser interrupted write: rollback plus successful retry without losing people.
- Pending edit blocks deletion and status changes; stale confirmation preserves newer data.
- Domain validation/eligibility and status display for active, paused, rented and sold.
- Sync engine: offline failure, reconnect, first sync with stale remote edit, repeated sync, retained people/requests and unrelated tasks.
- Owned-file cleanup retry, preservation of original inbox media, removal of property follow-ups/notices, and preservation of unrelated tasks.
- Full mobile tests, domain tests, typechecks, and web production export are run before publishing.

No real user records were deleted during verification. Native Android dialog/touch behavior, real-account multi-device sync and storage permissions still require APK acceptance testing. No APK/AAB was built for this change.
