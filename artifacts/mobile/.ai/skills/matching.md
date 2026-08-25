# ViewState AI Skill — Matching Engine

**Read this before implementing any matching functionality in ViewState.**

---

## V001 Matching Scope — Governance Rule 12

ViewState V001 matching does **exactly three things**. Nothing more.

| Capability | Description |
|-----------|-------------|
| **Compare** | Field-by-field comparison between a requirement and a property |
| **Score** | Calculate a match score 0–100 based on how many criteria align |
| **Explain** | Show the broker exactly which fields matched and which didn't (breakdown) |

**Explicitly NOT in V001 matching:**
- No ML / AI recommendation engine
- No vector search or semantic similarity
- No automated push notifications for new matches
- No cross-broker matching
- No "similar properties" suggestions
- No natural language requirement parsing

Architecture must allow upgrading to ML in V002 without breaking the API contract.

---

## What Is Matching?

The matching engine is ViewState's core value proposition. It automatically compares a buyer's or tenant's stated requirements against all active properties and generates match records when criteria align.

---

## Matching Philosophy (V001)

- **Rule-based only (Rule 12).** No ML, no embeddings, no fuzzy logic. Simple field-to-field comparison.
- **Transparent.** Every match has an explainable score — the broker sees exactly why a match was made.
- **Conservative.** A match is only generated if the score reaches the threshold — not every property is shown.
- **On-demand + triggered.** Matching runs when: a new property is added, a new requirement is added, or the broker manually requests a re-match.

---

## Matching Algorithm (v1)

### Input
- `Property` record (from `properties` table)
- `BuyerRequirement` record (from `buyer_requirements` table)

### Fields compared

| Field | Match condition | Points |
|-------|----------------|--------|
| `type` | `property.type` matches `requirement.type` (or requirement is `'any'`) | 30 |
| `purpose` | `property.purpose` matches `requirement.purpose` (or requirement is `'any'`) | 20 |
| `price` | `property.price` is between `requirement.budget_min` and `requirement.budget_max` | 25 |
| location field | property location area is in requirement's preferred location areas | 15 |
| `area_sqm` | `property.area_sqm` is between `requirement.area_min_sqm` and `requirement.area_max_sqm` | 5 |
| `bedrooms` | `property.bedrooms >= requirement.bedrooms_min` | 5 |

**Total possible: 100 points**

### Threshold
- Score ≥ 60: match is created (`status: 'pending'`)
- Score < 60: no match created

### Null handling
- If a requirement field is null, that criterion is skipped (not penalized)
- If a property field is null, that criterion scores 0 (counts against if requirement specifies it)

---

## Match Score Implementation

```typescript
interface MatchInput {
  property: Property;
  requirement: BuyerRequirement;
}

interface MatchResult {
  score: number; // 0-100
  breakdown: MatchBreakdown;
  isMatch: boolean; // score >= 60
}

interface MatchBreakdown {
  type: number;      // 0 or 30
  purpose: number;   // 0 or 20
  price: number;     // 0 or 25
  location: number;    // 0 or 15 — field name is illustrative; exact name deferred to Database stage
  area: number;      // 0 or 5
  bedrooms: number;  // 0 or 5
}

export function calculateMatchScore({ property, requirement }: MatchInput): MatchResult {
  const breakdown: MatchBreakdown = {
    type: 0,
    purpose: 0,
    price: 0,
    location: 0,
    area: 0,
    bedrooms: 0,
  };

  // Type match
  if (!requirement.type || requirement.type === 'any' || property.type === requirement.type) {
    breakdown.type = 30;
  }

  // Purpose match
  if (!requirement.purpose || requirement.purpose === 'any' || property.purpose === requirement.purpose) {
    breakdown.purpose = 20;
  }

  // Price match
  if (property.price != null) {
    const minOk = requirement.budget_min == null || property.price >= requirement.budget_min;
    const maxOk = requirement.budget_max == null || property.price <= requirement.budget_max;
    if (minOk && maxOk) breakdown.price = 25;
  }

  // Location area match (market-configurable field)
  // NOTE: exact field names (property.locationField / requirement.locationPreferences) are
  // determined by the Database stage — use whatever names the schema settles on.
  // The matching logic concept: property's location area is in the requirement's preferred areas.
  // If requirement has no location preference, location scores full points.
  if (property.locationField && requirement.locationPreferences?.length > 0) {
    if (requirement.locationPreferences.includes(property.locationField)) {
      breakdown.location = 15;
    }
  } else if (!requirement.locationPreferences || requirement.locationPreferences.length === 0) {
    breakdown.location = 15; // No location restriction = full score
  }

  // Area match
  if (property.area_sqm != null) {
    const minOk = requirement.area_min_sqm == null || property.area_sqm >= requirement.area_min_sqm;
    const maxOk = requirement.area_max_sqm == null || property.area_sqm <= requirement.area_max_sqm;
    if (minOk && maxOk) breakdown.area = 5;
  } else {
    breakdown.area = 5; // No area data = no penalty
  }

  // Bedrooms match
  if (property.bedrooms != null && requirement.bedrooms_min != null) {
    if (property.bedrooms >= requirement.bedrooms_min) breakdown.bedrooms = 5;
  } else {
    breakdown.bedrooms = 5; // No data = no penalty
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, breakdown, isMatch: score >= 60 };
}
```

---

## Match Record Lifecycle

```
created (status: 'pending')
  → broker views match (status: 'viewed')
    → broker marks interested (status: 'interested')
    → broker marks rejected (status: 'rejected')
  → deal closes (status: 'closed')
```

- Only the owning broker can update match status
- Closed and rejected matches are retained for analytics — never hard-deleted

---

## When Matching Runs

1. **New property saved** → run matching against all active requirements
2. **New requirement saved** → run matching against all active properties  
3. **Property updated** → invalidate old matches for this property, re-run
4. **Requirement updated** → invalidate old matches for this requirement, re-run
5. **Manual trigger** → broker presses "Find Matches" button on a property or requirement

---

## Match Display Rules

- Matches shown to the broker who owns the property (supply side)
- Score shown as a percentage badge: `85%`
- Breakdown shown in a collapsible section: "Why this match?"
- Contact details of the buyer not shown — only name and general requirement summary
- Broker must click "Express Interest" to reveal contact details (anti-spam)


---

## Governance Reconciliation — Effective Rules

This addendum is authoritative for future implementation after the approved governance reconciliation. Historical Stage 00.1–00.4 wording and prior decisions remain preserved as historical evidence; where a conflict exists, the later append-only reconciliation decisions control.

- Status remains PRE-IMPLEMENTATION.
- Stage 00.5 is not defined and must not be fabricated.
- Stage 01 has not begun.
- Product implementation remains unauthorized until a bounded Stage 01 Impact Analysis is approved.
- No database migration is authorized or required by this reconciliation.
- Any role, price, Draft, or compatibility migration reference is a future schema/compatibility risk only.
- If an implemented dataset is discovered before future schema work, the relevant stage must stop for a fresh compatibility and migration assessment.
- ViewState App is one Android/iOS product. Android-first is rollout priority only; iOS architectural compatibility is continuous.
- Simplicity and Speed, Capture First → Enrich Later, Private by default, Explicit sharing, and No silent loss remain mandatory.


## Governance Reconciliation — Matching Eligibility

Matching uses Seeker-owned Requirements and Properties within the same broker’s private inventory. A Seeker may own multiple independent Requirements. Requirement purpose is Rent or Buy and is not inferred from Person classification.

Both directions remain required: Requirement → Properties and Property → Requirements/associated Seekers. Matching is broker-initiated, rule-based, private, non-AI, and non-background. Results use the approved 0–100 score and ≥70% visibility threshold with explanations; zero qualifying matches is valid.

Tenant and Buyer are historical role values superseded for future implementation. No matching result may expose another broker’s data or linked-person information through Safe Share.