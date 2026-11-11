# Trust-circle server contract and release acceptance

Status: OVERALL DESIGN. Membership/inventory stage 01 is now deployed and tested as recorded in server-stage-01.md. Remaining pipeline/UI/notification stages below are not implemented; this contract is not a claim of complete backend or E2E readiness.
Baseline inspected: 0d9934bffb682688a5a35a58356aa79887dc6fcf.
Pilot scope: one circle, eight broker accounts, thirty distinct residential rental listings.

## Product decision

Sharing a property into a named circle explicitly authorizes a limited server projection for that circle. Publishing an ordinary private property does not share it. Subsequent saved edits to an already shared property update that projection; deletion or withdrawal revokes it. Circle sharing does not imply public advertising or permission to serve future consumer-app customers. Multiple circles are independent permission scopes; membership never becomes transitive.

Keep account_workspaces and account-workspace-media owner-only policies unchanged. Do not scan private workspaces with an administrator token to discover inventory. A server-only worker receives the minimum shared projection, never account workspace access merely for matching.

## Proposed additive server records

| Record | Key/ownership | Visibility and lifecycle |
|---|---|---|
| trust_circles | UUID, creator auth user UUID | Active members may see circle metadata |
| trust_circle_members | circle UUID + auth user UUID; invited/active/revoked | Creator invites/removes, invitee accepts; broker contact Person IDs are not auth identities |
| shared_property_offers | circle UUID + publisher auth UUID + local Property ID; server UUID, revision | Active members read allowlisted published fields; source owner alone changes/withdraws |
| shared_requirement_facts | circle UUID + requirement-owner auth UUID + local Requirement ID; revision | Owner and server matcher only by default; omit seeker name, phone and private notes |
| circle_match_events | scoped property/requirement IDs + input revisions + engine version | Accessible to the two entitled broker parties; no automatic disclosure of client identity |
| circle_notifications | event ID + recipient auth UUID + notification kind | Recipient only, subject to current authorization |
| delivery_outbox | event/recipient/channel key, attempts, next retry | Server only; durable dispatch, not direct browser push |
| device_registrations | recipient auth UUID + installation ID + push token | Owner registers/removes; token accessible to dispatcher only |

Use unique constraints on logical publication identity and event/recipient keys. Never deduplicate real-world units by matching price, room count or address text. Use source identity for repeated publication of the same record; flag suspected cross-broker duplicates for human resolution rather than silently merging them.

## Minimal RPC/API contract

- create_circle(name): derive creator from auth.uid(); create creator membership atomically.
- invite_circle_member(circle_id, target_auth_user): active creator only; no external invitation message is sent without authorization.
- accept_circle_invite(circle_id): invited identity only; activation is explicit.
- publish_circle_property(circle_id, source_id, expected_revision, allowed_fields): authenticated active member; bind publisher server-side. Validate typed fields and their allowlist on the server, not only on the device. Return server publication ID/revision.
- publish_circle_requirement(...): same ownership/revision boundary; public request handle is separate from private client identity.
- withdraw_circle_property(...): owner only; durable tombstone and revision prevent an old retry resurrecting a withdrawn record.
- remove_circle_member(...): creator only (self-leave separate); revoke reads, exclude publications and invalidate pending delivery in one authoritative operation.
- circle_candidates(circle_id, cursor): active-member authorization; immutable source identities and revisions; bounded pagination independent of the five-result UI shortlist.
- notifications(cursor): recipient-scoped reads; acknowledgements do not count as proof that push was received.

A caller must not submit arbitrary owner/recipient UUIDs for trusted writes, or self-promote membership. Match results and scores come from the existing TypeScript domain engine, not from client-supplied JSON. Avoid cloning ranking logic in SQL.

## Publication and offline contract

A private local save remains possible offline. An explicit circle share records a durable outbound intent after the save. The UI distinguishes local saved, publication pending, published and failed. On reconnection the server rechecks membership and expected revision. All local edits/deletes/availability changes of an already shared property queue the corresponding projection update or tombstone.

Server operations and the pending matching job must be committed atomically using a transactional outbox. De-duplicate transport retries using an operation ID and compare-and-swap revision; reject delayed older edits. A device offline at withdrawal cannot promise immediate remote revocation: show pending status and reconcile before allowing another share. Expired availability confirmation should not be presented to consumers as a confirmed offer.

A property may be published into multiple circles without exposing those circles to each other. Outbox publication IDs map to the same private source record. Deletion/status changes must update all its authorized publications, and new accounts must never reuse an old account's publication queue.

## Matching and notifications

The worker processes authorized published property/requirement facts with the current domain engine. Recheck active memberships, publication state, exact input revisions and engine version before committing results. If inputs changed during computation, discard the stale computation and retry. Keep private notes, names, phone numbers and exact source coordinates out of matching projections and notification payloads.

When a qualifying cross-broker pair appears, create two notifications: one for the requirement broker and one for the publishing broker. A property shared into several circles must not leak that fact; deduplication must retain provenance and verify entitlement before choosing a deliverable event. Changes invalidate stale results; repeat polls/retries must not create duplicate new-match alerts. Withdrawal/removal must suppress queued delivery and details reads. Push can be duplicated by providers, so notification IDs support client-side deduplication; do not claim exactly-once network delivery.

Only the private requirement owner can disclose customer contact information through a later explicit workflow. Alerts to the listing broker say a broker has a suitable client, not that the broker can read that client's private record.

App wiring is a separate necessary layer: circle sharing actions, authoritative publication status, a circle-scoped candidate source for existing matching screens, revision-aware result hydration, recipient inbox and push handling. The local test-only aggregate is deliberately not imported into application code.

## End-to-end acceptance: release remains blocked until these run

Use an isolated project/environment and eight real authenticated TEST identities (plus an outsider), never real client records. A service-role seed is setup only; authorization assertions must use individual user JWTs. Test database RLS directly as well as the UI; hidden buttons do not prove security.

1. Creator creates circle, invites seven users, each accepts. Pending invitation and outsider cannot read/publish. Users cannot join by inserting membership or changing role.
2. Each broker creates and shares 4/4/4/4/4/4/3/3 different properties through the actual ViewState UI. Verify server rows and revision/owner bindings. An additional private/unshared property remains invisible even to circle peers.
3. Publish one request per broker targeting the next broker's area; verify all 30 intended pairs against an independent fixture oracle, including both recipient inboxes. Current local comparator settings remain explicit, including strict location for this fixture. These matches are not a real-world accuracy estimate.
4. Confirm names, client phones, private notes and source contacts never appear in other accounts, API payloads or lock-screen notifications.
5. Edit price/specifications; stale result is invalidated and only current facts appear. Change available→rented, paused, delete, withdraw; each suppresses results and stale share actions. Re-enable with a new revision and verify current authorization.
6. Remove a member; attempt cached result details, new candidate reads, queued push dispatch and replayed publication as the removed identity. Deny each on the server. Retained downloaded data cannot be remotely erased reliably; app must clear its caches and expose no new access.
7. Attempt same local IDs in different accounts/circles, cross-circle reads, guessed IDs, self-assigned broker IDs and direct table writes. No cross-scope disclosure or overwrite.
8. Offline edit/restart/reconnect, duplicate retry, out-of-order update, worker interruption/retry and permission revocation during compute. No lost records, stale resurrection or duplicate durable event.
9. Real Android foreground/background/closed-app push and deep-link verification; permission denied, expired token and refreshed token; Arabic/English and system Back. Database outbox success is not proof of push delivery.
10. Clean only tagged test fixtures; retain logs/counts without credentials. Keep application/private data and existing workspaces intact. Roll back app version without dropping private data.

## What has actually been tested in this change

- Real WebStore code writes/reopens eight separate file-backed key/value adapters; thirty synthetic listings and eight requests. Native modules are stubbed as in existing repository tests; lock callback is a serial fixture helper, not a real Web Locks test.
- Current own-account source: zero cross-broker pairs, as expected for isolation.
- Explicit TEST-ONLY combined input to the production source adapter and matching service: thirty oracle-checked pairs. This is not server-side matching or authorization.
- Local notice repository: thirty new entries, persisted/reopened without duplicates; this is not dual-recipient remote notification or push delivery.
- Saved availability update removes the pair on the next run and invalidates its historical share handoff.

No hosted E2E, cloud migration, RLS execution, actual circle UI or push delivery is claimed by these local checks.
