# Compact raised list filters

Package base `83e6d3368f7c66841764878d5c9c5fab78f0a027`; branch `work/raised-filter-buttons`.

Properties and People filters use one presentation-only Pressable with a 34px visible height, 9px corners, a 2px lower edge, 1px shadow offset and a light shadow. Vertical hit slop adds 5px above/below inside the rows' 5px padding; the first row reserves 44px while reducing the visible button height. No timers or animation loops.

The five direction/transaction buttons have equal widths computed from the viewport, 20px outer gutters and four 6px gaps. The minimum width grows with supported text scaling; narrow screens retain the existing horizontal scroll. At 390px, each is approximately 65.2px wide. Residential/Commercial retain half of the available second row each with an 8px gap: 171px each at 390px. Both rows use the same 34px visible height. Existing selected blue/white colors are preserved.

No filter functions, option values, state transitions, data access, label wording or result projection changed. Second-tap cancellation, All reset, combined filters and Wanted/To buy translations remain intact. Form choices, bottom navigation and unrelated screens are untouched. No dependencies, data migration, native permissions or app-version changes.

## Validation

Existing mobile suite, workspace TypeScript, Android/iOS JavaScript export and whitespace checks. One existing filter-row reservation assertion changes to 44px; no behavioral expectations are relaxed.

Browser checks exercised Arabic Properties at 390px and English People at 320px, measured equal first-row widths and equal half-row sector widths, and verified selection/cancellation and stable widths when Sale changes to To buy. Measured visible heights: 34px for every filter; English 320px first-row widths: 56px each, sector widths: 136px each. No records were created or cleared.

Local HTTP secure-storage restrictions prevent persisted-record acceptance in this QA environment. Physical-device behavior, large OS text settings and native hit-slop acceptance remain unverified. No Replit refresh, APK, deployment or main/Pilot movement is included. Rollback is the preserved package base without migration or dependency rollback.
