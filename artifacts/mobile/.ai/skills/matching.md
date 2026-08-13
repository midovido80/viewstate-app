# ViewState AI Skill — Matching Engine

**Read this before implementing any matching functionality in ViewState.**

---

## What Is Matching?

The matching engine is ViewState's core value proposition. It automatically compares a buyer's stated requirements against all active properties in the system and generates match records when the criteria align sufficiently.

---

## Matching Philosophy (v1)

- **Rule-based only.** No ML, no embeddings, no fuzzy logic. Simple field-to-field comparison.
- **Transparent.** Every match has an explainable score. The broker can see exactly why a match was made.
- **Conservative.** A match should only be generated if it's genuinely plausible — not every property is shown to every buyer.
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
| `governorate` | `property.governorate` is in `requirement.governorate[]` | 15 |
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
  governorate: number; // 0 or 15
  area: number;      // 0 or 5
  bedrooms: number;  // 0 or 5
}

export function calculateMatchScore({ property, requirement }: MatchInput): MatchResult {
  const breakdown: MatchBreakdown = {
    type: 0,
    purpose: 0,
    price: 0,
    governorate: 0,
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

  // Governorate match
  if (property.governorate && requirement.governorate && requirement.governorate.length > 0) {
    if (requirement.governorate.includes(property.governorate)) {
      breakdown.governorate = 15;
    }
  } else if (!requirement.governorate || requirement.governorate.length === 0) {
    breakdown.governorate = 15; // No restriction = full score
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
