# ViewState Matching — shortlist-v2

Founder approved a new matching policy on 2026-10-24. This replaces the old M2 70% policy and the older illustrative 60% algorithm. They must not be restored as fallbacks.

## One runtime path

`MyPropertiesMatchingSource` -> `BrokerInitiatedMatching` -> domain `evaluateMatch` / `selectMatchShortlist` -> Matching screen.

- Only `MATCH_ENGINE_VERSION = shortlist-v2` results are accepted.
- Each ranking operation belongs to exactly one Requirement ID. Mixed IDs fail closed.
- Saved-request entry scopes to that exact request; Match All remains a separate manual tab action.
- One local Property snapshot per explicit run; a new source refreshes it for every run.
- Results and refinements are transient. No saved requirements or properties are changed by matching.
- Commission, source prestige, private notes, media and exact coordinates never influence ranking.

## Classification and comparisons

- Property type, transaction and currency are mandatory.
- Explicit Apartment subtype and Floor use must agree. Missing requested evidence needs confirmation.
- Only applicable structured facts may be compared; stale hidden form fields are suppressed.
- Both Rent and Buy compare requested native specifications and catalog preferences.
- Equal selected areas are accepted equally; All Kuwait adds no area penalty.
- Other areas require explicit selection in this request's session refinements. No adjacency inference.
- Rental periods must agree. No daily/monthly/annual arithmetic is silently assumed. Missing historical request cadence needs confirmation.
- Physical/building and land areas are distinct; square feet are converted to square metres. Partial complex offers use available portion area.
- Positive requested features can be a discussion point. Explicit forbidden features, occupancy conflicts and commercial-use conflicts cannot be relaxed automatically.
- Other Built Property requests currently have no saved residential/commercial use; keep them in confirmation rather than guess the use.
- Nearby lists confirm listed services only; an unlisted service remains Unknown, not absent.
- Unsupported facts, including a request with no recorded counterpart, remain Unknown. Notes are not parsed to fill them.

## Initial test policy (visible in UI, to be calibrated with Founder)

- At most five ready suggestions; do not pad empty places.
- Price up to 10% above maximum may be a discussion candidate. A lower price is not rejected solely for being below the budget's lower endpoint.
- At most 10% area shortfall, or one unit below a requested numeric minimum.
- Exact floor number remains exact.
- At most two logical differences; nearby services form one logical group.
- Internal minimum quality 75/100; this is a ranking rule, never closing probability.
- Direct results precede provisional suggestions, followed by discussion alternatives. Equal quality/difference/unknown counts prefer the lower comparable price, then stable chronology. Small diversity reranking only within the same category and three quality points of its best candidate.
- Core missing facts and any session-strict missing fact go into a separate, bounded confirmation list. Secondary missing details may produce a clearly labelled provisional suggestion only when observed quality still reaches 75. Unknown facts earn zero points; they are never counted as met.
- Session strict fields can prohibit price/count/feature relaxation. Explicit alternative areas are per-request. Opening a property retains an in-memory return context for 15 minutes; return reloads records and recalculates results, with the same request, refinements and scroll. No scores are cached. Closing the app clears this context.

## Not included

No commission, ML, vector dependencies, cross-broker discovery, notifications, persisted rejection history, inferred building duplicates or automatic edits to client requirements.

## Acceptance

Behavior tests cover subtype/sector isolation, budgets and boundaries, area units, Rent cadence, Buy specifications, true/false/unknown, hidden legacy fields, one/two/multiple differences, privacy, deterministic bounded selection, replacement, shared snapshots, stale versions and mixed-request rejection. Full existing domain/mobile/typecheck gates must pass before Founder review.

## Presentation corrections

Each result identifies the client and compares requested versus recorded facts. Below-minimum prices remain allowed but are explicitly labelled. Missing core evidence is collapsed separately. Property Back uses internal routing, never a full web anchor reload. Legacy Apartment category fallback is shared with saved display and never rewrites the source. Amenity choices remain contiguous in a two-column grid; numeric and conditional detail fields follow below.

## Founder-approved matching cards (2026-10-27)

- Default grouping is By people; By properties reverses only the same bounded results, without rerunning another engine or broadening candidates.
- Count distinct Property IDs per person and distinct Person IDs per Property; preserve separate Requirement IDs. Never describe three properties for one person as three people.
- Person headings are dark orange on pale peach. Property cards have navy titles and blue prices. Comparison rows alternate white and pale blue with readable RTL order.
- A white check inside a green circle means a recorded condition is met. A white X inside a red circle means it differs/is not met. Unknown evidence stays amber and is never marked as a negative fact.
- Missing-information results stay separately labelled as properties or people and collapsed. At most one outer group and one comparison card are expanded; five rows initially, with full comparison on demand.
- Return context also retains grouping and expanded IDs in RAM, while results are always recalculated from current saved records. No new stored data, dependencies or scoring rules.
