# Property forms: reference alignment and save feedback

Base: `0588edacff42a709a3ef8640b1e7a73a3d41ce39`, branch `work/viewstate-next-20261107`.

## Findings and changes

- **Observed in source:** the details editor returned on `requiredForm.validate()` before awaiting queued draft writes or revealing page 0. A save from the location/media page could therefore appear inert while missing required bedroom/bathroom/building fields stayed hidden. Save now awaits the current draft mutation, validates that snapshot, reveals the details page, and focuses only after rendering. Next checks the required details before leaving page 0. Validation requirements themselves are unchanged.
- **Observed in the supplied screenshots:** specifications were stacked, with disproportionate vertical space and a kitchen-only partial row. Shared generic/profile fields now use a stable two-column layout, 12px column spacing and 16px row spacing. Long conditional building questions and layout collections retain full width. Bathroom/kitchen counts stay adjacent where kitchens apply; original fields remain mounted and keep their validation/save owners.
- Inputs/pickers use white surfaces, a subdued blue border, 48px minimum targets and consistent typography. Error state overrides focus. Pickers dismiss the keyboard before opening; numeric choices still commit and close in one tap. Frequent pickers open/close without animation, including under reduced motion. Press feedback is immediate; no per-field motion listeners or per-frame layout animation are added.
- Building housing multiselection uses a compact dropdown while property service chips retain their original reversible toggles.
- Home saved/recent property headings use type-based labels, optionally bedroom count or housing, instead of a standalone saved adjective. Area remains below. The full saved title is not rewritten.

## Verification

- 994 mobile tests pass, including new regression tests for column grouping/large-text policy, classification headings, missing-field notice, page reveal before focus, and apartment/chalet/building updates through the original WebStore + update recovery with save/reopen readback.
- Existing original storage, compare-and-update, private data, draft recovery, matching and subtype tests remain in the suite. The injected test lock adapter is a unit-test fixture; browser storage safeguards are unchanged.
- Browser **component harness**, using the actual form components and fictional state: apartment/whole-building, Arabic/English, numeric selection, housing multiselection and Done. It is not the authenticated app and does not verify account persistence or sync.
- Browser geometry: the 390px fixture has a 324px grid. First four apartment controls measured 156px each, at x=201/33 and y=223/317: equal columns, a 12px gap and aligned row starts.
- Visual review corrected the first whole-building draft: housing chips and long conditional questions caused uneven rows. Housing now uses its multiselect dropdown; long questions span both columns. No fields were removed to improve alignment.
- [Actual component screenshot, fictional data](qa/form-columns-ar.jpg).

## Limits and required Replit/device checks

The user's exact failed save has not been reproduced in their signed-in Replit workspace. The confirmed hidden-validation defect is fixed; a separate storage failure remains possible and must be reported if it occurs. The main local app still cannot open guest storage on the managed HTTP origin, so this work does not claim a complete browser save journey or final pixel parity there.

On secure Replit Preview, test: reopen a basic apartment/chalet/building; try Next with missing required counts; enter valid values; move through all three pages; save; verify the success state and exact saved values after reload. Also test a failed storage write/retry, Back/drafts, RTL/English, manual numbers, keyboard access and enlarged system text. Native responsiveness and background behavior require the Android device. No APK, identity, backend, signing or deployment changes are part of this package.
