# Local guest workspace and optional Google activation

Work branch: `work/local-guest-activation`, based on approved auth/onboarding
checkpoint `84db299c8be2e37de5dd7d72d53ac24c262b7fbb`.
This package does not change matching rules, cloud schema, providers or dependencies.

## Entry and offline use

Every new installation/browser profile gets two choices: Use as guest and Continue
with Google. Guest setup requires a name; phone is optional and locally validated.
Neither field is sent to Supabase. A local UUID is made from OS/WebCrypto random
bytes, with no network or Math.random fallback. This is not Supabase anonymous auth.

Guest mode reuses the existing Properties/People/Requirements, matching, assistant,
notifications, drafts, recovery, maps and media functionality through its own immutable
scope. Native SQLite and media are under guest-specific filenames/directories; web
keys and IndexedDB are separate from authenticated accounts, even for equal UUIDs.
No Google SDK client is created on a normal guest startup. Returning to guest also
disposes any existing Google client and stops its automatic refresh/lifecycle work. A pending/failed Google
verification can be left for guest mode. External Maps or platform sharing still
use their ordinary external applications when the user chooses them.

The guest welcome uses the existing reduced-motion-aware ViewState welcome and
Skip/start. The selected guest mode and identity survive reload/restart. Guest data
is local, not a cloud backup, and anyone using the device can open its guest workspace.
Deleting app/browser storage can lose it. Existing unowned legacy trial records are
preserved but are not automatically assigned to a guest or Google user.

## Settings and sharing

Settings/account shows Guest mode, editable local name/phone and Activate my account.
Activation first drains pending local draft queues, closes the guest UI/lease and
opens Google sign-in. Google still requires a server-verified identity and a complete
name/phone/classification profile, with optional company/avatar. Guest name/phone
may prefill these fields; nothing is uploaded before the user saves the Google profile.

In an embedded web preview, Google login is not initiated inside the iframe. The
screen offers opening the app in a separate tab, or using guest mode. This avoids
starting the known failing embedded flow; it does not prove OAuth settings are correct.

Native/external property sharing remains available to a guest. The contact signature
is unchecked initially and contains local name/optional phone only when selected.
Internal ViewState network sharing, business/media cloud synchronization and paid
services are not implemented or silently activated by this package.

## Optional local transfer after Google verification

A separate consent screen names the verified email and offers importing guest data
or continuing without import. It explains that the transfer is between local storage
namespaces, not an upload of properties/media to the cloud.

- Copy Properties, People, canonical Requirements, links, sources, drafts/recovery,
  preferences, follow-ups, notices and referenced media through the existing stores.
- Preserve IDs, cover/order metadata and references. Rewrite native file roots to
  the destination owner's directory; web blobs are copied to its separate database.
  Copy bytes and read them back (native files use bounded 64KB verification chunks). Original guest files/records remain untouched.
- A durable journal binds consent and retries to one verified account before any
  file/record copy. A shared guest-owner lock prevents two concurrent destinations.
- Repeated successful transfer is a no-op. Partial failures retry the same snapshot
  for the same account. Conflicting IDs, phone identities or active drafts stop
  without overwriting the conflicting record. The guest original remains available.
- Existing nonconflicting account records remain. The account profile is retained;
  guest preferences can fill default settings, and follow-up/notice collections merge
  without duplicate IDs. Conflicting drafts require resolution rather than guessing.
- Check source stability and destination read-back before marking complete. An
  in-flight source change leaves a pending journal, not false completion.
- A completed workspace is archived locally: its original namespaces and local
  contact metadata remain for recovery, but choosing Guest next creates a fresh
  workspace, preventing another Google account from adopting the completed workspace.
- Declining before a transfer leaves the guest original separate and starts the
  Google account normally. A partial transfer cannot be dismissed as if nothing copied.

Close other app windows while transferring. Cross-storage import is resumable and
non-destructive, not one atomic database transaction. It may leave partial copies
visible to the same owner in another already-open window on failure. Recovery must
use the same verified destination; no cross-account data is exposed by app navigation.
No automatic conflict deletion, overwrite, remote merge or account reassignment occurs.

## Verification

Final local checks: 880/880 Mobile tests, full-workspace TypeScript, Domain/Matching,
whitespace and Android/iOS JavaScript exports passed. No APK was built.

Focused tests use the real WebStore and immutable scopes, including local contact
validation, equal-UUID guest/account separation, restart, ID/link/source/draft copy,
nonconflicting account preservation, duplicate-phone/draft rejection, partial disk
failure/retry, concurrent A/B claims, preferences, media-copy failure, source changes
and revoked leases. Test fixtures do not create real Google accounts or Supabase rows.

Local 390px UI checks reached Arabic guest setup (required name / optional phone),
welcome Skip, personalized Home, Settings activation and return to the existing guest
in English without repeating welcome. The local HTTP QA host lacks secure browser
locks, so business saves/follow-ups there remain unavailable; real store writes were
verified through the WebStore test harness rather than claimed from that browser.

Required acceptance: personal HTTPS Replit guest journey, real Google A/B activation,
media selection/copy/read-back, native airplane-mode restart, device scrolling and
share-sheet behavior. A JS export is not an APK or physical-device test.

## Recovery

Parent checkpoint remains reachable. No existing data is deleted and no remote
migration or service configuration is changed. Restoring the prior code/Preview
restores its prior entry behavior; new guest namespaces remain preserved for later
recovery but are not visible in code without guest support. No main/Pilot update,
company Preview change, publication, signing change or APK is included.
