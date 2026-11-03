# Approved mobile UX update

Baseline: `work/personal-expo-project` at `f229bf20783f1f4feaa4e4e26505c927f07340d2`.
Work branch: `work/approved-mobile-ux-20261103`.
Recovery branch: `recovery/pre-approved-mobile-ux-20261103` at the baseline.

## User-visible changes

- Opt-in compact single/multi-select form dropdowns. Existing list filters retain their controls and behavior. Counts support exact manual entry beyond common options; parking zero remains distinct from unset. Building floors offer 1–12; room counts 1–10; kitchens 0–5. Physical constraints such as commercial floors not exceeding total floors still apply.
- Offered/wanted type selection exposes residential and commercial lists. Commercial complexes are omitted for new rental capture, retained for sale/buy and in historical records.
- Property services / Required services replace amenity headings. Nearby-service input is limited to residential offers; saved historical nearby facts are retained.
- Independent kitchen details (layout, equipment and commercial private/shared access) round-trip through capture, edit, SQLite/web Requirement repositories and the existing matching engine. Unknown kitchen evidence remains unknown. Comparison assigns kitchens one-to-one regardless of order. A single kitchen uses count/layout/equipment in one row; enlarged fonts stack controls.
- Wanted occupancy supports families, bachelors, companies, women and mixed housing. Existing `any` rows remain readable. Villa/house/chalet guard-room facts are optional, with explicit yes/no.
- White quick-add plus in the raised blue center button on the bottom bar, retaining its existing flower actions. Home uses a compact calendar with pending counts and follow-up creation for the selected date. Full date selection remains available.
- Home match widget shows title/count/View; View opens the same best-five projection as Home. Match all clears scope and recomputes after loading. Match now scopes a saved property before shortlisting, or scopes a saved requirement, including unlinked requirements. Return context preserves property/requirement/best scope.
- Short agendas size to content; longer agendas retain an internal list. Native edge drags explicitly forward remaining movement to the page; web overscroll can propagate.
- Search cards wrap instead of truncating; intent gets its own line. Arabic headings/cards align right; phone text retains LTR digit order. Requirement details use tighter rows and all-Kuwait appears once.

## Validation and limits

Mobile/domain typechecks and automated tests cover exact numeric drafts, kitchen persistence/reopen, new occupancy, scoped matching, historical compatibility and account isolation. Android Metro export verifies bundling, not an APK install or touch behavior on hardware.

A web export attempt encountered the baseline Metro resolver configuration lacking `.wasm` asset handling for `expo-sqlite`. This change does not modify Metro configuration. Native Android export succeeds.

No APK/AAB build, signing change, Expo account operation, Replit update, database migration, business-data deletion or main/pilot branch update is part of this change. Device review remains necessary for nested-scroll feel, native dropdowns, enlarged Arabic text and calendar follow-up entry.
