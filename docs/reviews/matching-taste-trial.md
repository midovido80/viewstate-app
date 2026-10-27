# Matching UI — reversible Taste trial

- Approved baseline: `30fcd58b07913676858db19f94e549a9e20b5aff`, still on `work/matching-shortlist-v1`.
- Experiment: `work/matching-ui-taste-trial`. No promotion to the approved branch, Pilot or main without Founder acceptance.
- Full rollback: serve the approved SHA again. The experiment may be discarded without a migration or record rewrite.
- In development, `/dev/matching-ui-trial` offers Current design / Taste refinement using the same components and in-memory fixtures. Switching designs retains the exact requests, results and expanded IDs. The route is unavailable in production.

## Taste direction and constraints

Style: Accent ladder, seed 271026. Keep the existing palette and fonts. The screen's question is: which recorded properties fit this client's request, and what needs discussion? The signature element is the paired request/property comparison, with people in orange and recorded property values in navy.

The trial raises comparison type from 11px to 13px on phones and 14px at wider/larger text settings, raises the minimum row pitch from 38px to 44px, aligns price with the property heading, uses one consistent surface/border rhythm, and quietens secondary actions. The normal matching screen gets a bounded results width on larger previews.

Founder-approved exceptions take precedence over Taste house preferences: retain the blue/white zebra rows, orange person headings, blue actions, and white check/X inside green/red circles. Unknown facts stay amber. Retain Arabic RTL, existing fonts and React Native. No CSS/framework migration or dependency additions.

## Isolated review data

Four fictional contacts (ميدو، أحمد، خالد، سارة), each with one Salmiya apartment rental request for 400–500 KWD, 3 bedrooms minimum, 2 bathrooms minimum and central AC. Three fictional properties are 480, 490 and 500 KWD monthly; the 490 KWD alternative has 2 bedrooms and is therefore a discussion candidate. Counts, categories and comparison evidence come from the unchanged canonical matching engine. Nothing uses or writes the record stores.

## Verification

Require existing Mobile tests, TypeScript, Domain/matching tests and CI on the exact trial SHA. In the browser compare both designs on the same fixtures in Arabic/English at phone widths, inspect the discussion candidate's red X, check By people/By properties distinct counts, expand/collapse, scrolling and large text. Screenshot both variants before accepting.

The bundled Taste inspector cannot run in this Codex executor because Chrome/Edge/Chromium is not installed. No browser was installed for the experiment; use the available Replit browser for visual comparison. This is not a claim of a zero-failure Taste inspector result or physical Android acceptance.
