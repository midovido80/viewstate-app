# Match now stays on the current saved record

A Match now entry explicitly names either one Property or one Requirement. The route overwrites any retained parameters from the existing Matching tab, including old record IDs, Home best filtering and return tokens. Each new entry also has a distinct transient identity, so opening the same record again starts a fresh run rather than retaining previous exclusions.

For a Property, the candidate snapshot is narrowed to that exact ID before the existing engine ranks any requests. Only clients and requests with a shortlist result or an explicitly labelled needs-confirmation result remain in the presentation. Other saved requests belonging to the same client are also omitted. A Requirement entry runs only that requirement, including unlinked requests, against the existing inventory source.

A scoped entry displays its perspective, hides the general quick-matching mode selector, and retains scope when clearing results, rerunning, refining or returning from record details. Missing/invalid targets fail without a fallback general run. Empty results say that no suitable requests/properties exist for the selected record. Late results from another entry are rejected and previous-entry results are not rendered while the new entry loads.

Match all explicitly clears the record scope, the Home best flag, return state, exclusions and refinements, then runs general saved matching. It does not create or change any business records. The existing engine, scoring, eligibility, shortlist limits and needs-confirmation semantics are unchanged.

All current property save/detail, Studio save, Person requirement save/card, requirement detail, client-request list and notification entry points use the shared route constructor. Home Best/All actions also explicitly set their intended scope.

Verification includes real-engine tests with two different property types, unrelated requests and a client with both related and unrelated requests; exact-ID requirement execution; empty/missing targets; stale tab parameter replacement; fresh repeated entry identities; and scoped return links. Physical Android and visual Preview verification are separate release checks, not claimed by these tests.
