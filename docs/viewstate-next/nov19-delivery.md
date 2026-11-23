# November 19 import and circle delivery

Approved: three-step WhatsApp review, explicit duplicate comparison, source lookup across people and return from creation, prominent home circle/matching, RTL and standard Kuwaiti spelling, test both recipients and publish OTA to the existing pilot channel.

Execution: preserve existing domain validation, private originals, capture conflict protection and final business-record save. No native changes. Existing checkout contains the already published November 18/19 fixes and remains the release workspace.

- [x] Import flow and regression verification: 1046 mobile checks passed; typecheck passed.
- [x] Home/nav circle prominence and match entry. Dedicated Opportunities/Properties/Members sections and paired match details.
- [x] Two-recipient server/worker verification: four PostgreSQL/worker checks passed. Hosted rollback fixtures produced one inbox entry per role, rejected replay and resolved the same match ID for both, preserving legacy route fields. All fixtures removed. No physical two-phone delivery claim.
- [x] Independent review: listing management visibility, stale opportunity cleanup and duplicate identifiers corrected.
- [x] Android export (Hermes bundle) and OTA readback. Published group
  `6293dd4e-4de6-4209-92e1-1db1e6a95b0d`, Android update
  `01a1f2dd-f255-73c8-bf29-eca36ae98aae`, channel
  `viewstate-next-pilot`, environment `preview`, runtime
  `viewstate-next-android-1`. Two compatible registered devices queued for
  the genuine update announcement. Expo accepted both pushes and returned
  delivery tickets; physical phone display is not observable from this session.

Rollback: previous published group
`f426155e-de00-4d9e-88b5-c3ae0e506275`. Both additive database RPC revisions
remain compatible with that older client. No native dependency, permission,
identity or runtime changes.

Browser verification: isolated guest at 393px and 320px; RTL navigation, home
prominence, empty-input feedback, source deferral, person creation and return,
validated capture handoff, duplicate reopening; no page errors. This web check
does not exercise Android share intents, keyboard event ordering or device push.

Member summary RPC exposes names/company/state to active circle members only,
pending invites only to the owner, never phone numbers. New notification-open
response adds optional matchId while keeping legacy kind and targetId unchanged.
Both migrations were tested locally, then applied to the hosted project.
Advisors retain pre-existing extension/auth warnings and expected warnings for
intentional authenticated membership-checked SECURITY DEFINER RPCs; no anon
execute grant was introduced.

Ruling: final review opens the existing validated property/request form when additional required specifications remain. Label this action honestly; do not bypass domain validation to simulate a three-screen save.
