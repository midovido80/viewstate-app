# Person actions and matching continuity

Base: `767a41022b3fb4ed315a44397d424f472dbdbf52` (local guest activation).
Reused matching correction: `057a1b5623db6403d7680fbd6a179ca6687ecd8b`, whose parent is the shared Google-account revision `84db299c8be2e37de5dd7d72d53ac24c262b7fbb`.

The guest branch did not include the separately published outside-area matching correction. This integration retains guest/account isolation and adds that correction once. It does not establish which commit the personal Replit currently serves.

## Changes

- Person requirements have a full-width blue Add requirement action for every seeker; seeker-only contacts no longer repeat that action under Linked properties.
- Remove person is a separate pale-red button with a trash icon and its existing confirmation dialog. Edit person is an outlined action in the existing safe-area footer.
- Standalone ApprovedAction controls have an explicit nonshrinking 48px layout, including legacy `flex: 0` callers. Horizontal equal-width actions retain their 56px sizing.
- Matching uses shortlist-v4 everywhere. Outside-area candidates can be discussion alternatives unless location is strict; size/price limits, incompatible-type gates, maximum differences and missing-information rules remain enforced.
- Empty request groups retain refinement controls without inflating suggestion counts.

## Validation

883 Mobile tests and 27 Domain tests passed, including the whole-building 6800 KWD / 650 m² versus 6000–7000 KWD / minimum 700 m² case in different areas, strict-area exclusion, tolerance boundaries, and grouped empty results. Full workspace TypeScript passed.

Person UI checked in a 390px local web wrapper with an isolated in-memory fixture, not Founder records. Add requirement measured 48px. Edit opened and cancelled; delete confirmation opened and cancelled. The fixture and wrapper are outside the Git repository and are not shipped.

## Limits and rollback

Personal HTTPS Preview, real account switching, physical-device layout and complete saved-record acceptance still require verification. No new requirements fields, cloud schema, dependency, lockfile, billing, Expo owner, signing or APK changes are included. The user's remaining requirements-form changes need concrete examples before field changes.

The base and original matching branches remain available. Roll back Preview to its recorded prior SHA if needed; do not delete or rewrite unrelated branches. No main/Pilot merge is included.
