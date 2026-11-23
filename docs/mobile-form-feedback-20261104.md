# Approved form and inventory correction

The property screen now defaults to offered properties only. Its second in-screen tab, Client requests, reads the existing requirements and their existing Person associations; it does not create Property records or duplicate requirements. Transaction, sector and search filters apply within the selected tab. Request cards open their original details and can start matching scoped to the exact requirement ID. The bottom navigation is unchanged.

Home retains the compact date strip/calendar below search. The duplicate calendar and follow-up overflow menu next to the greeting are removed; date selection and follow-up creation remain available through the compact calendar and follow-up controls.

Services in capture/edit/requirement forms are direct text buttons, dark when selected and light when cleared by a second tap. Descriptive single-choice groups retain their existing dropdowns. Numeric dropdowns retain manual entry. The first bedroom/bathroom count option is Not specified, and selecting it sets the explicit completion flag; the redundant separate control is removed. Untouched required counts still require a number or an explicit unspecified choice. Arabic master-bedroom copy is consistently غرف ماستر.

Residential requirement forms, including Studio, no longer offer kitchen controls or add kitchen constraints to a saved edit/new request. Offered property and commercial requirement kitchen controls remain. Previously stored records remain intact until deliberately edited and saved; there is no data migration or bulk removal of legacy preferences.

## Verification

- 1,141 mobile tests passed, including new behavioral tests for stock/demand partition, transaction/sector/name filtering, original record identity, partial read failure, direct service toggles in both languages, exact manual count entry and explicit unspecified completion.
- Mobile and domain typechecks and Android Metro export are release checks. Android export is a JS/assets compilation, not an APK build.
- No physical Android or visual browser verification is claimed for this correction. This environment did not provide a runnable Chromium binary and browser download was unavailable.
- Device review: Home has one calendar; switch inventory tabs, combine sector and transaction filters, open a request's Person and scoped matching, create/edit standard/Studio residential requests without kitchens, retain offered/commercial kitchens, select/deselect services, and save unspecified counts.

## Isolation and rollback

Continue on `fix/offline-session-sync-20261104`. The pre-correction source is `d8ab4b03670166eb2d9a4c204b007ef12c3d01d4`. Main, pilot, the UX base branch and the existing offline-sync server schema are not modified by this correction. Reverting this commit restores the prior UI; deleting a Git branch does not revert installed applications or server data. Do not drop synchronization data/history as part of a UI rollback.
