# Request repair implementation plan

Approved spec: `C:/Users/Admin/Documents/ChatGPT/viewstate/nov19-1253-product-audit.ar.md` and its proposed screens, approved by the user for execution on 19 November 2026.

Goal: reliable request data, readable RTL forms and review, consistent rental cadence, followed by an independent offered-property code audit.

Architecture: preserve the existing Expo 54 application and durable local/account stores. Extend the existing typed catalog rather than adding parallel fields. Keep genuine sync collisions explicit; merge only demonstrably independent changes. Do not publish or modify live user records.

Execution: inline in the existing isolated android-pilot-people checkout, retaining all prior changes. No additional approval needed: report/design and execution already authorized. No dependency upgrades. Kuwaiti copy with standard Arabic spelling.

## Tasks

- [x] Sync: reproduce independent edits on the same record, ensure true same-field collisions remain explicit; fix merge and safe-area conflict UI with error/retry handling. No automatic resolution of live user conflicts.
- [x] Catalog: test approved building counts, warehouse choices/ceiling, plot area and kitchens through validation, persistence and matching. Extend closed domain contract and existing catalog rendering.
- [x] Request UI: organize basics/specifications/review, grouped type-specific fields, three-state services, clear counts and areas, consistent Arabic inputs and review. Preserve drafts/type transitions and idempotent save.
- [x] Cadence: daily/monthly/yearly in offered and wanted rent, no sale cadence; preserve unknown historical values and show context in summaries.
- [x] Verification: failing regression cases then passing targeted tests; full mobile suite, domain tests, TypeScript and export/UI evidence as available. Device behavior separately reported.
- [x] Independent final code review and offered-property audit: findings with triggers, source lines, impact, coverage and acceptance criteria; final report reconciles implemented vs outstanding/device-only checks.

## Review focus

Concurrent changes to the same field or deletion remain conflicts; invalid combined records are never published. New request catalog fields survive web/native serialization and circle projection. Arabic numerals and unknown/zero/false remain distinct. Rental period survives save/reopen and mismatched periods do not directly match. Service identities never degrade to generic names. Genuine production conflicts are not cleared by an application update.

## Ledger

19 Nov: report already approved; proceed without repeating approval. Property-add audit delegated read-only using dispatching-parallel-agents, independent from request implementation. Existing dirty checkout is the current delivered application baseline, not disposable work.

22 Nov: full mobile suite 1063/1063, TypeScript, Android/Web export, local PostgreSQL integration and actual browser save/reload/edit/matching journeys passed. Independent review findings closed. Hosted migration/worker and OTA not deployed. See request-repair-delivery-20261122.ar.md for evidence and limits.
