# Commercial offered/requested service parity

Base: `0db5091d6d2f126e50e58fd1f7ec60ece1f23642` (commercial requirement services). Scope: Office and Commercial Floor only, offered Rent/Sale create/edit, saved projection and matching against the existing requirement fields.

Optional physical JSON fields: `automaticNumberCount` (manual nonnegative safe integer), `hasFacilityCleaning` (boolean), `kitchenAccess` (private/shared, valid only with `hasKitchen: true`). No SQL table/column migration, dependency, cloud/Expo/signing changes. Old records need no backfill; old kitchen presence does not imply private or shared. Clearing a kitchen removes its access child; empty count remains missing while explicit zero remains zero. Existing unrelated property records are not rewritten.

The shared offered services block renders once in each of the four supported routes. The count is a manual input without area calculation or license-eligibility inference. New fields pass through existing draft, create, edit, detail/share formatting and Web-store JSON round trips. Physical applicability and value validation live in the domain, alongside UI feedback.

One matching evaluator advances to `shortlist-v7` and uses recorded offered facts: PACI count compares as a minimum; cleaning and kitchen privacy compare with the saved preferences. Missing evidence earns no confirmed-match points. The root PACI identifier and area never supply the count. The three missing-evidence limitations recorded in the preceding requirement-only package are resolved when an offered property contains these new facts.

Recovery source remains at the base SHA. No main/Pilot merge, Replit update, APK build or paid service is included. Browser QA uses the actual shared form components with isolated local state; persistence is verified independently through existing store/adapter tests, and does not claim native hardware acceptance.
