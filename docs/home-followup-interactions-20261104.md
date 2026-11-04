# Home follow-up interaction corrections

Base: `d8ab4b03670166eb2d9a4c204b007ef12c3d01d4` (`fix/offline-session-sync-20261104`).
Work branch: `fix/home-followup-interactions-20261104`.

## Behavior

- Close, backdrop dismissal and Android Modal back handling return date, person, property and time subviews to their parent form. Draft values remain in the parent; dismissing a child does not save a task or abandon the draft. Explicitly cancelling the root form still cancels it.
- The same native Modal remains mounted across editor/subview transitions. The workflow keeps a stable frame, dismisses the keyboard before changing subviews, and resets the subview scroll container so a picker does not inherit the editor's scroll offset. Inline component definitions that remounted date/footer/header controls were removed. ICU date/time formatters are reused rather than reconstructed for calendar cells on each render.
- Task, reschedule and outcome-next-follow-up time controls open a 12-hour clock with AM/PM (Arabic equivalents), hour/minute selection, exact-minute adjustments, explicit confirmation and cancellation. Optional time can be cleared; viewing time remains required. Storage stays HH:mm, with no record migration or timezone change.
- Follow-up settings now live under App settings > Follow-up settings, not Home's actions menu. The overdue-display preference saves through the existing owner-scoped repository and preserves other preferences and tasks.

## Verification

- Frozen installation with Node 24.22.1 / pnpm 10.26.1; no dependency or lockfile change.
- Workspace typecheck passed; mobile typecheck passed after final UI changes.
- Full configured mobile suite: 948 passed, zero failures. The host blocks the tsx CLI's Unix IPC pipe; the same configured test-file list was run using `node --import tsx --test`.
- Additional focused daily-assistant/Home/editor tests: 23 passed. Clock round-trip covers all 1,440 minutes, noon/midnight and invalid bounds; repository tests preserve tasks and concurrent settings across reload.
- Real Chromium UI checks against the corrected source at mobile width: child person/property/date close preserves typed title; person search retains input/focus while typing; changing a date preserves draft; 4:37 PM saves and reopens after reload; cancelling a changed time leaves the old time intact; settings link is removed from Home actions and its preference persists through reload. Arabic title preservation, Arabic clock controls and 12 PM selection passed. Clock inspected at 320px and 390px widths, including RTL screenshot review. No unhandled page exception was observed in these checks.
- The local web test required NODE_PATH to the already-installed transitive babel-preset-expo package. No application manifest or Babel configuration was altered for this host workaround.
- On the user's existing Limrun Android emulator, an isolated local Guest profile was initialized. The uploaded APK reproduced the reported navigation defect: Home actions > Availability check > Choose a person > Close returned Home. No task, contact or property was created in this native reproduction.

## Remaining acceptance

The existing APK on Limrun was not rebuilt or replaced. The corrected source's native keyboard transitions, Android hardware back and flicker/latency still require a new APK and native retest. Browser checks and source-level causes do not establish that native flicker is fully resolved. iOS native acceptance is not claimed. No extra Limrun instance, Expo build, paid service, production record change, migration, merge or main/pilot update was performed.
