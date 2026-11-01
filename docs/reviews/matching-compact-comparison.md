# Compact matching overview and on-demand comparison

Founder-approved visual proposal, based on `30fcd58b07913676858db19f94e549a9e20b5aff`.
Branch: `work/matching-compact-comparison`.

- Retain one canonical matching engine, distinct person/property counts, separate requests, exclusions and return context.
- Open the first person/property group, but leave all comparisons collapsed until requested.
- Orange person header and compact request strip; separate navy/blue property cards.
- Collapsed cards disclose differences and missing information immediately. Do not describe unknown facts as met.
- Expanded cards put differences/missing evidence before the alternating white/pale-blue comparison table. Status circles retain green check, red X and amber question mark; compact table icons retain accessible labels.
- Preserve the recorded budget range and numbers. Display currency once in the comparison price row.
- Rename replacement action to “اقتراح عقار آخر” / “Suggest another property”. Reuse the existing request-specific session exclusion and canonical recalculation; no stored property/requirement deletion or candidate broadening.
- Keep refinement controls, complete comparison, view property/person/request and return navigation.

No dependencies, persisted models, matching rules or other form changes. No Taste trial code or development comparison route is included. Rollback is serving the original `30fcd58` revision.

Validation: focused UI interaction tests cover opt-in comparisons, repeated taps, both grouping modes/languages, status icons, unknown evidence, difference placement and immutable inputs. Required CI gates and live Preview verification are recorded in the delivery report. Native Android remains a separate device check.
