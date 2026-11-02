# Required matching inputs — review package

Branch: `work/required-matching-fields`
Base: `65a94c2863f1ef4c88c0b1e09806103ccc965323` (compact Home retained).
Pilot at start: `ec9c8c621846281a1052486314233f25c7a1ded1`.

## Completion behavior

The existing quick-capture screens remain available. Full Property capture and saved-detail editing require area, a positive offer price, and the applicable specifications:

- Residential units: bedrooms and bathrooms; Studio retains its dedicated one-room/one-bathroom contract and legacy confirmation behavior.
- Commercial: positive area in square metres. No residential bedrooms are introduced.
- Whole residential buildings: total apartments, same/different layout selection, and bedrooms/bathrooms per apartment or per layout row. Generic building bedrooms are never required.
- Floor and Other: canonical use must be residential/commercial. Saved Property classification remains locked.

Required labels show a small red star. A failed review/save marks missing/invalid fields with a red border, a pale error background and bilingual inline feedback. The current scroll viewport measures the first target and scrolls it into view. Cross-step Requirement validation first returns to that step, then scrolls its newly mounted target. Conditional apartment-layout errors target the actual missing row input. Changing a value recomputes its error without discarding other inputs.

Exact map links, coordinates, attachments, master bedrooms, other amenities and nearby services remain optional. Existing Maps/media components are retained.

## Requirement persistence and matching

Area scope must be explicit: selected areas or All Kuwait. Unit bedrooms/bathrooms and commercial size require a value or an explicit Unspecified selection. Budget requires a positive bound/range or explicit Open budget. A zero-to-zero budget is no longer treated as completed input.

The canonical Requirement contract adds an optional `unspecifiedFields` list and optional `propertyUse` for Other. Open/one-sided budgets store genuinely absent bounds, not fabricated zero/infinite prices. Normalization retains these choices, rejects contradictory unspecified/value pairs, and continues to read older valid Requirements. No hydration migration or data clearing runs.

The existing single matcher supports the optional bounds: an open budget is omitted from scoring and refinement locks, not awarded fake points; existing bounded-budget behavior is retained. Other compares its recorded use. The engine version moves to `shortlist-v3` so older calculated results are not mixed into the current shortlist. No commission logic is added. Required-to-enter never means automatically non-negotiable.

## Verification and acceptance

Automated coverage exercises per-type/conditional required fields, explicit choices, canonical save/normalization/read-back, Studio open/one-sided budgets, and absence of fake budget match points. Run the existing Mobile, Domain/Matching and TypeScript gates, plus Android JavaScript export.

Device acceptance is still required for keyboard-visible automatic scrolling and actual touch gestures. A JavaScript export is not an APK or a physical Android/iOS test. The earlier local HTTP environment cannot establish secure Expo UUID/Web Locks journeys; use secure Replit Preview for full interactive acceptance.

Do not advance Pilot/main or build an APK as part of this package. The base SHA above remains the rollback point; this package is isolated to its work branch until acceptance.
