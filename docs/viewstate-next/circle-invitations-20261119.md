# Circle invitation and hub correction

Approved reference: circle picker, compact truthful matching status, Opportunities/
Properties/Members, opportunity cards, fixed Share listing + Invite colleague.
Remove UUID entry/sharing from the normal UI. Keep owner-only invitation authority.

Video evidence: 3:45 recording, 6-second contact sheets; invite sheet renders only
its heading, other sheets use the same unbounded flex viewport. Actions live above
the status rather than in a fixed footer. Member circles lose selection on return.
People classified as broker/company/management have no invitation entry.

Implementation:
- [x] Give action sheets a bounded height; hub owns its scrolling/footer.
- [x] Person invite action for collaboration roles; choose owned circle then channel.
- [x] Direct app invitation uses confirmed Auth phone only; unverified/unregistered
  phones get an honest WhatsApp alternative (hosted aggregate currently zero confirmed).
- [x] WhatsApp link is single-use, seven-day expiry, hashed at rest, owner-created,
  actor-confirmed before accepting; no raw account UUID in visible invitation.
- [x] Named invitation preview and pending-invite recovery across login.
- [x] Authenticated component fixture: actual hub/composer/matching-detail and
  scroll components, with API/context/native-leaf adapters. Fixed footer, bounded
  publish content, matching details, pause/enable, circle/person/channel selection,
  busy target locking, WhatsApp prepared text without user ID, 393px/320px. No
  external message sent by the harness.
- [x] Mobile suite: 1048/1048; typecheck clean; four server/worker checks pass.
  Hosted rollback verifies preview, idempotent acceptance, single-use, expiry,
  unconfirmed-phone refusal and fixture cleanup. Hosted HTTPS GET redirects to
  the fixed app scheme; invalid token returns400. Physical Android link launching
  and actual WhatsApp Send remain device acceptance checks.
- [x] Android export passed; invitation migration and public redirect deployed.
- [x] OTA publication/readback: group
  `7f09df7e-acee-4571-8e44-929df1d6fb82`, Android update
  `01a1f322-e3ca-7f8d-b55b-d846ce18423c`, pilot channel and unchanged
  `viewstate-next-android-1` runtime. Two compatible devices queued for the
  genuine update announcement. Previous rollback group:
  `6293dd4e-4de6-4209-92e1-1db1e6a95b0d`; database additions preserve old RPCs.

Review corrections: target controls are locked during sending; link cache binds
circle plus phone; preview storage awaits are generation guarded and failures
handled; pending resume skips an already open invitation route. Direct phone
attempts are rate-limited30/hour per inviter (including unavailable lookups), and
already-active/pending recipients have truthful statuses. Pause affects only the
current actor's shared requests. Direct invitation acceptance selects the joined
circle immediately. Names/company are disclosed only through membership-checked
RPCs or a valid authenticated invite preview. Advisories are expected private
RLS/no-policy and authenticated guarded-RPC warnings plus existing project alerts.

Name rule: inviter account display name is shown. WhatsApp controls its own local
address-book display. The app does not read or upload the recipient's phone book.
Sharing opens WhatsApp with prepared text; it never silently sends a message.
