# Approved ViewState light design implementation

Baseline: `f4023c4f23924b77ab27cd34279e152acacaeb73` (tree `6b7e4e9d7d79935b8fded1109fba85665f220846`).
Implementation branch: `work/approved-light-design`.
Recovery reference: `recovery/pre-approved-light-design-20261101` at the baseline.

The founder approved the standalone interactive demo `ViewState-Interactive-Demo.html` (demo source commit `eff42ba2dc29fb0026a2b6023e7c88f928452930`). This package adapts its light presentation to the existing React Native app. It does not install the demo's fake authentication, sample records, scores, or sharing actions.

## Result

- Shared light palette, vector V mark and white brand headers. Properties/People retain their local search and expose global search as a header icon, avoiding two consecutive search fields. Bell badge reads actual unread notifications; gear opens the existing account/settings route.
- Account entry uses the existing real Google and local Guest commands, including busy, retry, errors, external-browser entry, and guest activation. Email/password is explicitly inactive and collects no credentials; Apple is explicitly deferred. Neither provider is represented as working. No provider settings, payments, cloud schema, or OAuth security checks changed.
- First-use welcome has a vector V, restrained native-driver motion, personal greeting, Skip, and manual continuation. It automatically continues after 5.2 seconds while active when motion is enabled. Reduced-motion preferences disable animation and automatic progression. Existing owner-scoped welcome flags and profile completion remain authoritative. Fonts now load before the auth gate, including first launch.
- Home keeps its calendar, global search, quick-add flower, actual opportunity counts, and independent inner agenda scrolling. The existing quick actions and task commands remain intact. Tab transitions respect reduced motion; four equal raised tab buttons keep navigation events and route parameters.
- Property list cards use actual saved cover images, localized intent/type/subtype, real price/location and recorded bedroom/bathroom/area facts. A missing photo has an honest empty state. Web cover object URLs are scoped to the active user's media repository and revoked on unmount or replacement; native media ownership is checked before rendering.
- Details present the existing image gallery before identity/specifications. Gallery paging, counter, expansion, source linking, maps, attachments, share and edit are retained. Gallery sizing responds to viewport width. Features retain the existing ordered two-column layout and private/display filtering.
- Matching cards display the existing engine's score in a vector ring, with the saved property and client/request beside each other when expanded. Existing groups, capped recommendations, discussion/confirmation policy, colored status circles, compare toggles, replacement, and return routes are preserved. The engine, storage contracts, migrations, validation and business forms are not replaced.

## Verification

- Mobile suite: 901 passing, including Google/Guest isolation, account lifecycle, profile validation, requirements/forms, matching/return navigation and repeated interactions.
- Property domain suite: 29 passing; matching/domain implementation unchanged.
- Workspace TypeScript check passes. Android and iOS JavaScript export checks pass (not APK/IPA builds or physical-device acceptance).
- Browser review of real components at a 390px iframe width: Google/Guest entry presentation in both languages; actual local guest name save and welcome; property list/filters, saved-image resolution, details/gallery/specifications, matching score/pair/table, repeated expand/collapse. Synthetic records and a labelled QA illustration live only in an isolated QA workspace, outside this repository.
- Browser warnings already present in RN Web (legacy direction/style and extension messages) are not represented as application acceptance failures. HTTP local QA lacks browser secure-context `crypto.randomUUID`, so capture persistence/real OAuth is not accepted from that local host; automated persistence/isolation checks remain green. Real Google acceptance requires the configured HTTPS preview and the user's Google test accounts.

## Rollback and deployment

Main, Pilot/release refs, the company-linked Expo owner, and Replit workspaces are unchanged. No dependencies, lockfile, records, media files, cloud allowlists or production configuration are modified. To revert the complete design package, use the baseline SHA in a clean recovery checkout, or revert the design commit on a separate branch. Do not reset or delete user data. A Replit update should check out the final implementation SHA and run its locked dependencies; it is a separate operation.
