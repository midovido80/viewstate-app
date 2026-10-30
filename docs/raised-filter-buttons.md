# Raised list filters

Base `83e6d3368f7c66841764878d5c9c5fab78f0a027`; independent branch `work/raised-filter-buttons`.

Properties and People list filters use a shared presentation-only Pressable: 14px corners, thin border with a 3px raised lower edge, small shadow, 44px minimum touch height and 1px press depression. Selected filters retain the existing primary-blue/white colors. The intent row keeps one horizontal scrollable line; its 60px reservation and 4px top padding leave room for the button and shadow. Residential/Commercial keep equal widths below it. Existing 8px gaps are preserved.

No filter functions, option values, state transitions, data access, labels or result projection changed. A second tap still deselects direction/transaction/sector filters. All still resets both dimensions and the sector. Wanted sale labels still change to To buy/للشراء. Form choices and bottom navigation are untouched. No dependencies, data migration, native permissions or app-version changes.

Browser checks: Properties and People in Arabic, second-tap cancellation, combined intent/transaction/sector selections, All reset, English Wanted/To buy labels and cancellation, and 320/390px display. The last English transaction filter was reached through horizontal scrolling and successfully selected; its measured touch height was 48px. Local HTTP secure-storage restrictions prevent acceptance with persisted user records; unchanged filter/domain behavior remains covered by the existing suite. Physical devices remain unverified.

Required validation: existing mobile suite, workspace TypeScript, Android/iOS JavaScript exports, diff whitespace and GitHub CI. One existing layout assertion changes from a 52px to a 60px filter-row reservation; no behavioral test expectations are relaxed. This package does not refresh Replit, build an APK, merge, or move main/Pilot.

Rollback: the preserved base commit, without migration or dependency rollback.
