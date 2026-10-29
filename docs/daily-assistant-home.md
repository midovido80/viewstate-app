# Daily assistant Home

Base: `bff056b156f94d347b48dbc0f1db59ec16d86494`.
Approved reference: `design/daily-assistant-approved-demo.html` (the independent-scroll revision).

Home now presents the Kuwait date, daily counts, calendar, scheduled follow-ups, overdue work, evidence-based suggestions, progress and quick actions. Existing property/person/matching/import shortcuts remain available. Arabic RTL and English use existing application fonts. Warnings, notices and numeric badges use the requested red treatment. Presentation tokens live only in `components/assistant/styles.ts`; they can be replaced without replacing the follow-up log.

The agenda heading and horizontal filters sit outside its bounded vertical ScrollView. Both page and agenda enable native nested scrolling; the web agenda contains wheel overscroll. No handler disables the outer page. Dialog action footers remain outside dialog scrolling, with safe-area and keyboard accommodation. Targets are at least 44px for primary controls.

Follow-ups start empty. They link to canonical saved people/properties, or optionally use an explicitly reminder-only person label. Nothing seeds fictional records or invents contact dates. Outcomes, rescheduling, cancellation/recovery, history, next follow-up, reload and latest-action undo operate on a separate versioned AsyncStorage record. Writes are serialized and read back; damaged/future schemas are preserved. Web writers additionally require Web Locks in a secure browser. Uncertain writes require reload. Call/WhatsApp buttons open the external app only on explicit action; opening one never records a successful contact or sends a message automatically.

Availability confirmations are assistant log entries only: they do not change Property fields or the matching engine. Suggestions use explicit logged contact/availability and upcoming viewing evidence; accepting one is an explicit action. There are no background/device push notifications, cloud synchronization, SMS, paid services, dependencies, migrations, or schema changes in this package.

## Verification

- Mobile suite: 788 passing, including 15 new domain/repository scenarios. Locally the exact test file list was run with `node --import tsx --test` because the tsx CLI's IPC socket is prohibited in this execution environment.
- Property domain script passed, including its 25 matching tests.
- Full workspace and mobile typechecks passed.
- Android JavaScript export passed; this is not a signed APK or device test.
- Browser app mounted and rendered. Its HTTP-only local preview correctly refuses storage access because Web Locks/secure crypto are unavailable. This prevents claiming successful interactive save/reload or gesture acceptance in that browser. No application security fallback was added for the local preview.

## Founder acceptance on secure Preview / device

1. Confirm the served commit and clean checkout; install the unchanged lockfile with the project's Node 24 / pnpm 10.26.1 setup. Start the existing Expo workflow. Do not seed, clear or migrate business records.
2. At 360px, 390px and 430px, check Arabic/English, large system text, safe areas, buttons, calendar and modal keyboard/footer access.
3. Add enough real test follow-ups to overflow the agenda. Drag/wheel inside it: only tasks move, heading/filters remain. At both list boundaries, verify the page stays still. Drag outside it: the page/header move normally. Repeat twice, including returning from other tabs and opening/closing dialogs. Confirm native Android boundary behavior separately; browser wheel behavior is not proof of touch behavior.
4. Create a viewing with time/duration and linked person/property. Reject overlap, allow adjacent times, save/reload, reschedule, search and filter. Counts distinguish people, properties and tasks.
5. Record no answer: no successful contact/availability is inferred. Record outcome plus next follow-up, reload, undo once, cancel and recover. Verify a second open web tab cannot overwrite a stale edit.
6. Check explicit availability results and suggestions, contact actions, existing shortcuts, tab navigation and untouched property/person forms. No device notifications should be promised while the app is closed.

The package is ready for secure Preview review after CI, not final Founder/device acceptance. Replit and protected branches are not advanced by this package. Revert the package commit or select the base SHA to return to the previous Home; the separate assistant storage key is left intact and ignored by that version.
