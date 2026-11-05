# Unified Back policy

Approved 2026-11-05. Continues on `fix/offline-session-sync-20261104`; no production branch or APK build.

| Context | Back behavior |
| --- | --- |
| Child picker, calendar or nested sheet | Return to its parent and retain parent entries. |
| Multi-step requirement or property review | Return one existing workflow step; retain fields and attachments. |
| First editable step | Confirm local draft persistence, then use actual navigation history. Use a bounded contextual destination for a deep link without history. |
| Inline Person editor | Save local draft, return to the Person detail, retain the route's original history. |
| Saved property success | Close the completed capture stack; Back opens the saved record or originating Person, never an empty capture form. Explicit actions such as Match now keep their exact destination. |
| Bottom tabs | Return through previously visited tabs. |
| Local storage failure | Keep the form open with its entries and allow retry. |
| Discard | Separate, explicit action with confirmation. Never inferred from ordinary Back. |

`useDraftBack` handles screen actions, focused Android hardware Back and native navigation removals/gestures through React Navigation's public `usePreventRemove`. Review-step Back consumes the removal without replaying it. First-step exits wait for persistence before replaying the original action. Focus cleanup removes hidden-screen listeners; late persistence cannot navigate away from another screen. Completed writes skip review-step navigation.

Existing offered capture and property edit repositories remain authoritative for their drafts. New, account-scoped local form sessions retain Requirement, Studio, Person, profile and assistant editor snapshots. Assistant calendar and record pickers retain their parent state; outcome/reschedule forms return to detail. New snapshots include stable entity IDs and edit baselines. They do not create business records, sync to the server, or bypass existing save validation/conflict checks. Incomplete drafts may be retained without required-field validation. Writes and clears are serialized and verified by readback. Corrupt snapshots stay in storage and block an unsafe exit; an explicit discard permits recovery. Hydration never overwrites edits begun while reading.

A Back exit preserves a local draft, not a cloud backup. This change does not promise recovery after OS termination before any persistence boundary. Studio media referenced by a retained draft is kept rather than deleted by the old unmount cleanup.

## Verification

- Pinned pnpm 10.26.1 frozen-lockfile install succeeded (local lifecycle scripts skipped); no resolution/version change. The already-resolved React Navigation native package is now an explicit mobile dependency.
- Mobile and property-domain TypeScript checks passed.
- Complete mobile test selection passed using Node 24 with the tsx loader; dedicated production-hook scheduler tests cover header/hardware/gesture Back, single flight, persistence failure/retry, focus cleanup, late saves, explicit destination priority, inline reopen, hydration races, owner isolation, corrupt drafts and readback failure.
- Property-domain suites: 29 passed.
- Expo Android Metro/Hermes export passed. This is a JavaScript bundle check, not an APK/AAB build.
- Physical Android/iOS gestures, keyboard interactions and visual positioning remain device acceptance checks; no emulator/device run is claimed.

Suggested device acceptance: edit several fields, navigate backward twice, reopen the form; open a child calendar/picker and use Android Back; complete a capture and use Match now, then Back; repeat with network disconnected; navigate across tabs; verify discard only removes the intended form draft.
