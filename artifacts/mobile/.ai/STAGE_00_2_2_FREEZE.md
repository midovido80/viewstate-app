# Stage 00.2.2 — Minimum Capability Analysis
## FORMAL FREEZE RECORD

---

**Stage:** 00.2.2 — Minimum Capability Analysis
**Status:** 🔒 FROZEN / APPROVED
**Frozen by:** Founder + CTO
**Freeze date:** 2026-08-13
**Authorization:** Founder verbal authorization — "نفذ ال correction و ال verification و اقفل المرحة دي"
**Recorded in:** DECISIONS.md DEC-018 · DEC-019 · DEC-020 · DEC-021
**Analysis document:** `STAGE_00_2_2_ANALYSIS.md`

---

## Freeze Declaration

Stage 00.2.2 — Minimum Capability Analysis is hereby **FROZEN and APPROVED**.

The minimum capability definitions documented in this stage are the authoritative, locked definition of the minimum product behavior required for each of the 15 V001 capabilities. No implementation session, AI agent, or collaborator may silently alter the substance of any Stage 00.2.2 decision.

Any future modification to Stage 00.2.2 content requires an **explicit governed change request** under the Change Policy (Category A — Governance changes), with Founder written approval, an exact diff shown before applying, and a new decision entry logged in DECISIONS.md.

---

## What Is Frozen — Stage 00.2.2 Approved Minimum Capability Definitions

### Three Founder Decisions (frozen as DEC-018, DEC-019, DEC-020)

| Decision | Resolution | DEC |
|----------|-----------|-----|
| Matching direction | V001 Matching is **bidirectional**: Direction A (Requirement → Properties) and Direction B (Property → Requirements / relevant Buyer-Tenant contacts). Both produce Compare + Score (0–100) + Explain. Broker-initiated, rule-based, per-broker, private, non-AI. | DEC-018 |
| Requirements cardinality | A Buyer/Tenant contact may have **one or more Requirements**. No artificial limit. Each Requirement independently capturable, enrichable, and matchable. No lifecycle/status/priority rules. | DEC-019 |
| Notes cardinality | **One editable running internal note per Contact** and **one editable running internal note per Property** in V001. Plain-text concept. Broker can read and update. Property Notes remain distinct from Property Description. Persistence deferred to Database stage. | DEC-020 |

---

### 15 Minimum Capability Definitions (frozen)

| # | Capability | Minimum V001 Product Behavior |
|---|-----------|------------------------------|
| 1 | Properties | Type + purpose + price + market-configured location area minimum; bilingual fields; media attachment supported |
| 2 | Contacts | Name + phone minimum; exactly four roles (Buyer/Tenant/Owner/Broker); multi-role supported |
| 3 | Buyer/Tenant Requirements | One or more Requirements per Buyer/Tenant; property type + budget range minimum per Requirement; each independently matchable |
| 4 | Matching | Bidirectional (Requirement→Properties and Property→Requirements/Clients); Compare + Score (0–100) + Explain; broker-initiated; rule-based; non-AI; per-broker |
| 5 | Classification | Optional 4-label tag (Follow Up / Important / Pending / Order Complete or Closed Deal); one at a time per record; no dates, reminders, or automation |
| 6 | Global Search | Every primary screen; contact names + phone numbers + property titles + location areas; grouped results |
| 7 | WhatsApp / WA Business Communication Choice | Both required; selected app opens; mechanism deferred to Integration stage |
| 8 | Import | WhatsApp-driven + WA Business-driven + device contacts; all produce Contact records; mechanism deferred |
| 9 | Property Sharing via WhatsApp / WA Business | Private, one-to-one, broker-initiated; both apps required; UX order deferred; mechanism deferred |
| 10 | User Profile | Broker profile + language preference (Arabic/English) → RTL/LTR; Basic Settings is sub-capability |
| 11 | Authentication / Login | Account creation + login + authenticated session; per-broker data isolation; session lifetime deferred to Foundation/Auth stage |
| 12 | Media & Attachments | Photos + Videos + Documents on property records; storage/format deferred |
| 13 | Contact Notes | One editable running internal note per Contact; plain-text; broker read/update; persistence deferred |
| 14 | Property Notes | One editable running internal note per Property; plain-text; distinct from Property Description; broker read/update; persistence deferred |
| 15 | Property Location | Broker selects from pre-loaded, market-configured location source; Kuwait area list = first market configuration; location structure, hierarchy, and visual selection method deferred to UX/Market Configuration/Database stages |

---

### Core Scope Rules (Frozen from Stage 00.2.2)

1. **Capture First → Enrich Later is intact.** Multiple Requirements do not increase Contact capture burden. Requirements are a separate demand-record workflow.

2. **10–15 second basic capture target is intact.** Applies to basic Contact, Property, and Requirement capture only — not to full enrichment.

3. **Capture → Organize → Act is fully covered.** All three phases have dedicated capabilities.

4. **Matching North Star is strengthened.** Bidirectional matching enables both demand-led and inventory-led discovery within the broker's own private data.

5. **No lifecycle management for Requirements.** No active/inactive status, no priority ranking, no expiration, no version history.

6. **Notes are one editable running note per record.** Not an append-only log, not a timeline, not a task system.

7. **Property Location visual selection method is undecided.** Structure (flat/hierarchical), presentation (list/map/other), and coordinate usage are all deferred to UX / Market Configuration / Database stages.

8. **Session lifetime and re-authentication behavior are undecided.** Deferred to Foundation/Auth stage and auth-provider decision (DEC-008 PENDING).

9. **Property Sharing UX entry point and selection order are undecided.** Deferred to UX stage.

---

## What Is NOT Frozen by Stage 00.2.2

The following are explicitly deferred — Stage 00.2.2 makes no claim on any of them:

| Topic | Deferred to |
|-------|------------|
| Auth provider (DEC-008 PENDING) | Foundation stage |
| Object storage provider (DEC-009 PENDING) | Media stage |
| Session lifetime and re-authentication behavior | Foundation/Auth stage (dependent on DEC-008) |
| Database schema, column names, types, nullability, constraints | Database stage |
| Notes persistence (column name, data type, storage structure) | Database stage |
| Classification persistence representation | Database stage |
| Property Notes column name, type, localization representation | Database stage |
| Location field column name, type, nullability | Database stage |
| Property location visual selection method (list, map, or other) | UX stage |
| Coordinate/GPS usage in location workflows | UX / Database stages |
| Kuwait area taxonomy (names, groupings, IDs, source) | Market Configuration stage |
| Location structure and hierarchy (flat, hierarchical, nested, etc.) | Market Configuration / Database stage |
| Market configuration layer design | Architecture stage |
| Matching scoring weights, thresholds, algorithm implementation | Implementation stage |
| WhatsApp / WhatsApp Business technical mechanism | Integration stage |
| Property Sharing payload format, property card design | Integration / UX stages |
| Property Sharing UX entry point and selection order | UX stage |
| Import mechanism (WhatsApp-driven, device contacts) | Integration stage |
| Media storage architecture, file size limits, codecs, document extensions | Architecture / Database / Media stages |
| Kuwait phone number format | Market Configuration stage |
| Currency code defaults and constraints | Database / Market Configuration stage |
| GCC market configurations (post-Kuwait) | Post-Kuwait Market Configuration stages |
| Brand primary blue hex | UI stage |
| Arabic translations (ar.json) | Founder-authored, before UI stage |
| All V001 deferred capabilities | Post-V001 |

---

## Change Policy for Frozen Stage

This stage is governed by **Change Policy Category A — Governance changes** (highest risk).

**Process for any future change to Stage 00.2.2 content:**
1. Founder proposes the change in writing with rationale
2. AI shows the exact diff of what would change
3. Founder explicitly confirms
4. AI applies the change
5. A new decision entry is logged in DECISIONS.md with date, reason, and reference to this freeze record

**Prohibited without this process:**
- Any AI session silently editing Stage 00.2.2 minimum capability definitions during implementation work
- Any implementation session "updating" Stage 00.2.2 definitions as a side effect
- Expanding or narrowing any minimum capability definition without a formal change request

---

## Implementation Status at Freeze

**PRE-IMPLEMENTATION — confirmed.**
Zero product feature code has been written or modified. The app scaffold is a blank Expo shell with no product UI. All implementation layers remain locked pending explicit Founder authorization.

---

## Next Stage

**Stage 00.2.3** has NOT started. It remains **WAITING** and must not begin until the Founder explicitly authorizes it with a separate authorization command.
