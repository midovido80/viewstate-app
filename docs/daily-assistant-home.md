# Compact assistant Home

Approved reference: `design/daily-assistant-approved-demo.html`, compact demo version 2. The prior dense Home component is removed. The tabs index renders only `CompactAssistantScreen`; there is one assistant repository and one versioned local log, with no duplicate task engine or migration.

The screen contains greeting and current Kuwait date, calendar and action tools, global search, a five-action radial quick-add menu, one best-match summary, a compact independently scrolling agenda, and three real overview counts. Existing property/person capture routes are used directly. Sharing selects a saved property and opens its existing sharing screen. Home import remains explicitly unavailable; it never requests permissions or pretends to import.

The radial menu uses existing Animated APIs, labelled 76×72px actions, reduced-motion support, outside dismissal, a close button and native Back dismissal. The app's real tab bar remains unchanged. The agenda uses the already-installed gesture-handler ScrollView with interruption protection on native, plus web overscroll containment; the heading stays outside. Main-page scrolling is never disabled through a persistent scroll-lock state.

Match recommendations use the existing BrokerInitiatedMatching and MyPropertiesMatchingSource against one saved catalog snapshot. No scoring rules or commission logic are introduced. Only eligible qualified results of the current engine version are shown, highest score first across its shortlists, capped at five distinct person/property pairs. Multiple requests for the same person/property keep the strongest result. Unknown-only results do not pad the list. Counts and scores are actual; zero, loading, unavailable and error states remain distinct. Matching work yields between requirements and is cancelled when Home loses focus.

The existing global search also searches saved follow-ups by title, notes, linked names/areas, and normalized dates including Arabic/Persian digits. All task statuses are searchable. Selecting a task returns to the single Home detail sheet, including repeated opens of the same task. Catalog search remains independent if task storage is unavailable. User names are preserved.

Follow-up creation, rescheduling, outcomes, history, cancellation/recovery, latest-action undo, storage safeguards and explicit contact actions reuse the existing implementation. No sample records or percentages are imported from the reference HTML into app data. Background/device notifications, cloud services, dependencies and property/person form changes are outside this package.

## Verification and acceptance

- 793 mobile tests pass, including five new quick-route, current-engine selection, deduplication, search/date and Kuwait greeting scenarios.
- Property Domain and 25 matching tests, full-workspace/mobile TypeScript, and Android JavaScript export pass locally. JavaScript export is not an APK or device test.
- The app renders at 390px in Arabic. The radial menu opens with labelled actions; choosing Person reaches the existing NewPersonScreen. HTTP-only local QA cannot complete secure crypto/Web Locks operations: that existing screen fails its secure randomUUID call and the assistant refuses storage. No insecure workaround was added. A secure Replit Preview is required for complete route/save/reload acceptance.
- Still required: secure Preview Arabic/English, profile greeting, property/person navigation, share/import states, top-five comparison grouping, empty/error inventories, repeated task search opens, save/reload and outcome/undo. Check actual Android/iOS inner-scroll boundary behaviour, keyboard and safe areas separately.
- Main/Pilot and EAS are not changed. The old Home PR is closed and its local branch deleted. Remote old-branch deletion requires successful GitHub authentication and must be verified separately; a remaining Git reference does not create a second page in the running app.
