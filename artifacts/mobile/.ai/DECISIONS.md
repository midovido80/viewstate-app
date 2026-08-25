# ViewState App — Decisions Log

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## How to Use This Log

Every significant architectural, product, or tooling decision is recorded here before implementation. Entries are immutable — once written, never deleted (mark as SUPERSEDED if reversed, not deleted).

### Entry format

```
## [DEC-XXX] — [Short title]
Date: YYYY-MM-DD
Status: ACTIVE | SUPERSEDED | PENDING
Decided by: Founder | AI Proposal (Founder approved) | Open
Category: Architecture | Product | Tooling | UX | Data

### Context
[Why was this decision needed?]

### Decision
[What was decided?]

### Rationale
[Why this option?]

### Alternatives considered
- [Option A]: rejected because [reason]

### Consequences
[What does this lock in? What does it prevent?]
```

---

## Decisions

---

## [DEC-001] — Governance-first project structure
Date: 2026-08-13  
Status: ACTIVE  
Decided by: Founder  
Category: Architecture

### Context
Project started from scratch. Founder requires tight control over all AI sessions and layer-by-layer build with explicit approval gates.

### Decision
The very first action is the Governance Package. No product feature is implemented until governance is complete and the Founder explicitly unlocks each layer. Governance uses the exact approved filenames: README.md, PROJECT_BIBLE.md, ARCHITECTURE.md, UX_RULES.md, DATABASE_RULES.md, CHANGE_POLICY.md, AI_WORKFLOW.md, TESTING.md, GRILL_ME.md, DECISIONS.md, CURRENT_STATE.md.

### Rationale
Governance retrofitted after code exists is ignored. Governance-first gives the Founder control over every decision.

### Consequences
Project is in PRE-IMPLEMENTATION state. Nothing is built until explicitly unlocked.

---

## [DEC-002] — Bilingual Arabic/English from day one
Date: 2026-08-13  
Status: ACTIVE  
Decided by: Founder  
Category: UX + Data

### Decision
Every user-visible string has both `ar` and `en` versions. Every text DB column has `_ar` and `_en` variants. The app defaults to Arabic (RTL).

### Rationale
Retrofitting bilingual support is expensive and error-prone. Zero tech debt on this dimension from day one.

### Consequences
All DB schemas must include bilingual text columns. All i18n keys written in both languages before any screen is considered done.

---

## [DEC-003] — React Native + Expo as mobile platform
Date: 2026-08-13  
Status: ACTIVE  
Decided by: Founder  
Category: Architecture

### Decision
React Native with Expo (SDK 53+). Expo Router for file-based navigation. NativeTabs on iOS 26+.

### Rationale
Expo provides device features (contacts, camera, file system) via JavaScript API. Replit environment supports Expo Go for live preview. TypeScript-first stack shares types with the Express API server.

### Consequences
Only Expo Go compatible packages may be used in the mobile client.

---

## [DEC-004] — V001 contact roles: Tenant, Buyer, Owner, Broker only
Date: 2026-08-13  
Status: ACTIVE  
Decided by: Founder  
Category: Product (Rule 11)

### Decision
V001 supports exactly four contact roles: Tenant, Buyer, Owner, Broker. No other roles.

### Rationale
These four roles cover the approved V001 broker use case. Additional roles (investor, developer, etc.) are deferred to V002.

### Consequences
The `contacts.roles` DB column is a text array constrained to these four values. UI role picker shows exactly four options.

---

## [DEC-005] — V001 matching: Compare + Score + Explain only
Date: 2026-08-13  
Status: ACTIVE  
Decided by: Founder  
Category: Architecture (Rule 12)

### Decision
V001 matching engine does exactly: Compare (field-to-field), Score (0–100), Explain (breakdown per field). No ML, no embeddings, no automated notifications.

### Rationale
Rule-based matching is transparent, debuggable, and fully unit-testable. V002 can upgrade to ML without changing the API contract.

### Consequences
Matching is deterministic. Every match has an explainable score breakdown. Architecture must allow ML upgrade in V002.

---

## [DEC-006] — Global Search is a core utility on every primary screen
Date: 2026-08-13  
Status: ACTIVE  
Decided by: Founder  
Category: UX (Rule 13)

### Decision
Global Search lives in the blue top header on every primary tab screen. Not a secondary feature — a core utility. Searches across contacts and properties simultaneously.

### Consequences
`GlobalSearchBar` is a shared component imported by every primary screen layout. Search architecture must support cross-entity results.

---

## [DEC-007] — Visual baseline locked for V001
Date: 2026-08-13  
Status: ACTIVE  
Decided by: Founder  
Category: UX (Rule 14)

### Decision
V001 visual baseline: blue header, global search in header, white/light background, red for headings/key data, blue for action buttons, green for WhatsApp/Call actions, minimal colors elsewhere.

### Consequences
`constants/colors.ts` is locked to these tokens. No AI session may introduce additional accent colors.

---

## [DEC-008] — Auth provider: PENDING FOUNDER DECISION
Date: 2026-08-13  
Status: PENDING  
Decided by: Open  
Category: Architecture

### Options
A) Clerk with phone OTP  
B) Replit Auth  
C) Custom phone OTP with SMS provider (e.g., Vonage, Twilio)

---

## [DEC-009] — Object storage provider: PENDING FOUNDER DECISION
Date: 2026-08-13  
Status: PENDING  
Decided by: Open  
Category: Architecture

### Options
A) Replit Object Storage (App Storage) — simplest  
B) Cloudinary — image optimization included  
C) AWS S3 — most flexible

---

## [DEC-010] — V001 contact and property classification system
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder
Category: Product

### Context
Stage 00.1 approved a minimal follow-up capability as in-scope for V001. The Founder defined the exact scope.

### Decision
V001 includes an optional lightweight classification system attached to a Contact or a Property. Exactly four labels are permitted: **Follow Up**, **Important**, **Pending**, **Order Complete / Closed Deal**. The label appears visibly next to the contact name or property title. Only one label at a time per record.

### Rules
- Classification is optional — broker applies it only when needed
- No dates, scheduled reminders, automation, pipeline stages, or calendar integration
- "Order Complete / Closed Deal" is a status label only — NOT a deal ledger, transaction tracker, or commission system
- Persistence column name, SQL type, constraint representation (TEXT check / ENUM / etc.), and nullability are deferred to the Database stage

### Consequences
Replaces the earlier "Tasks & Follow-up system — Deferred" entry. A full task-management or reminder engine remains deferred. This classification system is the complete V001 follow-up scope.

---

## [DEC-011] — WhatsApp and WhatsApp Business as dual required communication channels
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder
Category: Product + Integration

### Context
Stage 00.1 required clarification on the WhatsApp product scope. The Founder confirmed both apps are required.

### Decision
ViewState V001 must support both WhatsApp and WhatsApp Business as required communication channel options. When the broker initiates a communication action from a contact or property workflow, ViewState presents a choice between WhatsApp and WhatsApp Business. The selected app is opened.

### Rationale
Brokers use both personal WhatsApp and WhatsApp Business accounts in their daily workflow. Both must be reachable from ViewState without forcing the broker to leave the app and manually switch.

### Boundary
The precise technical mechanism (deep links, intents, APIs) is NOT decided at Stage 00.1. It is decided in the Integration stage. ViewState also supports WhatsApp and WhatsApp Business as data import/capture sources — mechanism TBD in Integration stage. V001 does NOT include in-app messaging or WhatsApp Business API for automated messaging.

### Consequences
All previous governance text that locked V001 to `.txt` export parsing as the settled product-level integration approach has been updated to reflect this open boundary.

---

## [DEC-012] — Market-configurable location taxonomy
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder
Category: Product

### Context
Governance files previously hard-coded Egypt's 27 governorates as the universal location taxonomy. The product definition requires location taxonomy to be generic and market-configurable. Kuwait is the first operational/deployment market; GCC is the planned expansion region.

### Decision
ViewState's location concept for properties and requirements must be generic and market-configurable. The specific taxonomy (areas, districts, regions, etc.) is market configuration — loaded per deployment, not hard-coded into product code or governance. Kuwait is the first operational/deployment market for V001; Kuwait's area taxonomy is the first concrete market configuration. GCC expansion follows, with each market providing its own location taxonomy. No country-specific location list or administrative term is hard-coded into the core product definition.

### Consequences
- All hard-coded Egypt-specific governorate lists and Egypt-specific location wording removed from governance files
- Exact column name, data type, nullability, and schema representation for the location field are deferred to the Database stage
- Market configuration layer design (what it provides, how it is structured, which fields it exposes) is deferred to the Architecture stage

---

## [DEC-013] — Kuwait as first operational/deployment market; GCC expansion planned
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder
Category: Product

### Context
The prior governance wording stated "GCC is the first deployment market." The Founder has specified Kuwait more precisely as the first operational/deployment market for V001.

### Decision
ViewState V001's first operational/deployment market is **Kuwait**. GCC is the planned expansion region after the Kuwait-first release. The product itself remains generic and scalable beyond any single country — Kuwait-first is an operational decision, not a product architecture constraint.

### Product-level consequences
- Property and location workflows must be capable of supporting a Kuwait-first market configuration in which the broker can select from Kuwait areas when entering property data
- The complete Kuwait area taxonomy (names, groupings, IDs, source, update mechanism) is deferred to the Market Configuration / Property / Database stage — it is NOT decided in Stage 00.1
- Where a real country context is needed for V001 product-definition examples or market configuration illustration, use Kuwait (not UAE or any other GCC country)
- If a real V001 market currency example is ever required in a later stage, Kuwait uses KWD — but KWD is not a universal core product default and must not be treated as such in Stage 00.1
- Additional GCC markets after Kuwait provide their own location taxonomies, currencies, phone formats, and locale settings via market configuration

### What is NOT locked by this decision
- Kuwait area names, count, grouping, or data source → Market Configuration stage
- Database column name or type for the location field → Database stage
- Phone number format for Kuwait → Market Configuration stage
- KWD as a hardcoded currency default → Market Configuration stage

---

## [DEC-014] — Formal Freeze: Stage 00.1 — Product Purpose & User Lock
Date: 2026-08-13
Status: ACTIVE — PERMANENT FREEZE RECORD
Decided by: Founder + CTO
Category: Governance (Category A — highest risk)
Authorization: Founder verbal authorization — "نفذ"

### Decision
Stage 00.1 — Product Purpose & User Lock is **FROZEN and APPROVED** as of 2026-08-13.

The product-level decisions documented across Stage 00.1 (DEC-001 through DEC-013 as they relate to product purpose and user lock) are now the authoritative, locked definition of what ViewState is, who it is for, and what V001 delivers.

### Frozen Content Summary
The following product-level decisions are frozen under this entry — see `STAGE_00_1_FREEZE.md` for the full formal record:
- Generic real-estate tool for professional brokers/consultants — market-configurable and scalable
- Kuwait as first operational/deployment market; GCC expansion planned
- Primary user: broker/consultant, mobile-first, no demographic assumptions
- Operating model: Capture → Organize → Act; Matching is North Star, not only value
- Speed target: ~10–15 seconds for basic capture only
- Requirements as explicit named V001 feature
- V001 scope fixed: Contacts · Properties · Requirements · Matching · Classification · Import/WhatsApp+WA Business · Global Search · User Profile · Arabic/English
- Classification: 4 optional labels (Follow Up / Important / Pending / Order Complete or Closed Deal) — no reminders, no automation, no deal ledger; persistence deferred to Database stage
- WhatsApp + WhatsApp Business: both required communication choices; technical mechanism deferred to Integration stage
- Location: market-configurable concept; Kuwait area taxonomy as first market config; persistence deferred to Database stage
- All approved V001 'is NOT' boundaries

### Change Process
Any future change to Stage 00.1 content requires Change Policy Category A: Founder written approval → exact diff shown → Founder confirms → applied → new DECISIONS.md entry logged. Silent edits during implementation sessions are prohibited (Rule 6).

### What Is NOT Locked
All schema, architecture, integration, and market configuration specifics remain deferred to their respective stages. See `STAGE_00_1_FREEZE.md` — "What Is NOT Frozen" table.

### Implementation Status
PRE-IMPLEMENTATION confirmed. Zero product code written or modified. Stage 00.2 has NOT started — WAITING for Founder authorization.

---

## [DEC-015] — Editorial governance correction: DEC-004 stale market reference
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder (session authorization — Stage 00.2.1 governance correction pass)
Category: Governance (Change Policy — Editorial Correction)

### Context
DEC-004's authoritative decision is correct and unchanged: V001 supports exactly four contact roles — Tenant, Buyer, Owner, Broker. No other roles. However, DEC-004's rationale sentence referred to "the Egyptian broker's immediate use case." DEC-012 and DEC-013 subsequently locked Kuwait as the first operational/deployment market and established the product core as generic and market-configurable. The Egypt reference became stale and inconsistent with frozen Stage 00.1 governance.

### Decision
The rationale phrase "100% of the Egyptian broker's immediate use case" is replaced with market-neutral wording: "the approved V001 broker use case." No other content in DEC-004 is changed. The four roles (Tenant, Buyer, Owner, Broker), their behavior, multi-role support rule, schema constraint reference, and V002 deferral note are all unchanged.

### Change Policy compliance
- Category: Editorial correction to a stale market reference in a rationale sentence only
- The authoritative decision text of DEC-004 is not modified
- No Stage 00.1 product decision is reopened or altered
- No role is added, removed, renamed, or reordered
- No schema, implementation, or behavior change
- Founder explicit authorization: Stage 00.2.1 governance correction session, 2026-08-13
- Logged per Change Policy requirements

---

## [DEC-016] — Commission Management and Analytics/Reporting classified as DEFERRED
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder (Stage 00.2.1 freeze pass authorization)
Category: Product (Scope Classification)

### Context
Stage 00.2.1 CTO verification identified that Commission Management and Analytics/Reporting were classified as OUT OF V001 in the analysis, while PROJECT_BIBLE.md listed both as "Deferred." This created a classification inconsistency. The analysis also used contradictory wording ("explicitly excluded and deferred") for Commission Management. A Founder decision was required to confirm the intended classification.

### Decision
**Commission Management = DEFERRED** — not in V001; intentionally preserved for later ViewState versions. V001's "Order Complete / Closed Deal" classification label covers basic deal closure acknowledgement. Full commission tracking, calculation, and management may be added or expanded in later versions. Architecture must not block future inclusion.

**Analytics / Reporting = DEFERRED** — not in V001; intentionally preserved for later ViewState versions. Analytics features grow in value as broker data accumulates. Analytics dashboards, usage reporting, and performance metrics are natural post-V001 additions. Architecture must not block future inclusion.

### Founder authorization intent
"موافق اذا كان ده هيكون سهل فى الاصدارات التالية من فيوستيت اننا نعدل او نضيف عليهم او نوسع فيهم و نضيف عليهم فيتشرز جديدة"
(Approved so that it will be easy in later versions of ViewState to modify, add to, expand, and add new features to these capabilities.)

### Consequences
- Final Stage 00.2.1 scope count: **15 IN V001 + 5 OUT OF V001 + 5 DEFERRED = 25 top-level decisions**
- Commission Management and Analytics/Reporting removed from OUT OF V001; added to DEFERRED
- Architecture for all V001 modules must not block adding Commission and Analytics features in V002+
- PROJECT_BIBLE.md OUT OF SCOPE table wording is resolved: both were already listed as "Deferred" there; this decision formalizes that classification

---

## [DEC-017] — Formal Freeze: Stage 00.2.1 — V001 Scope Analysis
Date: 2026-08-13
Status: ACTIVE — PERMANENT FREEZE RECORD
Decided by: Founder + CTO
Category: Governance (Category A — highest risk)
Authorization: Founder verbal authorization — "موافق"

### Decision
Stage 00.2.1 — V001 Scope Analysis is **FROZEN and APPROVED** as of 2026-08-13.

The product-scope decisions documented in `STAGE_00_2_1_ANALYSIS.md` are the authoritative, locked definition of the ViewState V001 capability boundary. No implementation session, AI agent, or collaborator may silently alter the substance of any Stage 00.2.1 decision.

### Frozen Content Summary
See `STAGE_00_2_1_FREEZE.md` for the full formal record. Summary:
- **15 IN V001:** Authentication/Login · Contacts (4 roles) · Properties · Buyer/Tenant Requirements · Matching · Classification (4 labels) · Global Search · WhatsApp/WA Business Communication Choice · Property Sharing via WhatsApp/WA Business · Import · User Profile · Media & Attachments (Photos+Videos+Documents) · Contact Notes · Property Notes · Property Location
- **5 OUT OF V001:** Tasks/Reminders · Deal Management · Broker-to-Broker Network/Marketplace · Public Property Portal · AI Assistant/NLI
- **5 DEFERRED:** Full Export System · Market Configuration (administration) · Backup/Sync · Commission Management · Analytics/Reporting
- **Total:** 27 visible inventory rows · 2 sub-capabilities (Basic Settings, Follow-up Classifications) · **25 top-level decisions**

### Change Process
Any future change to Stage 00.2.1 content requires Change Policy Category A: Founder written approval → exact diff shown → Founder confirms → applied → new DECISIONS.md entry logged. Silent edits during implementation sessions are prohibited (Rule 6).

### What Is NOT Locked by Stage 00.2.1
All schema, architecture, integration mechanisms, UI flows, Kuwait area taxonomy, storage provider, auth provider, and market configuration specifics remain deferred to their respective stages. See `STAGE_00_2_1_FREEZE.md` — "What Is NOT Frozen" table.

### Implementation Status
PRE-IMPLEMENTATION confirmed. Zero product code written or modified. Stage 00.2.2 has NOT started — WAITING for separate Founder authorization.

---

## [DEC-018] — V001 Matching is bidirectional
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder (Stage 00.2.2 Founder Decision 1)
Category: Product (Rule 12)

### Context
Stage 00.2.2 CTO verification identified that the original minimum capability analysis did not resolve the matching direction. The Founder confirmed V001 must support both directions.

### Decision
V001 Matching must support both directions:
- **Direction A — Requirement → Properties:** Broker starts from a Buyer/Tenant Requirement and identifies matching Properties from their own inventory.
- **Direction B — Property → Requirements / Relevant Clients:** Broker starts from a Property and identifies matching Buyer/Tenant Requirements associated with relevant contacts in the broker's own data.

Both directions follow the frozen product principle: Compare → Score (0–100) → Explain.

Matching remains: broker-initiated · rule-based · per-broker · private · non-AI · non-marketplace.

### What Is NOT Decided Here
Scoring weights, scoring thresholds beyond already frozen governance, algorithms, queries, schema, automatic alerts, push notifications, ML, embeddings, cross-broker matching.

### Consequences
The bidirectionality is a product behavior boundary only. Neither direction triggers automated behavior. Architecture must support both entry points. Mechanism, query implementation, and screen design are deferred to their respective stages.

---

## [DEC-019] — Buyer/Tenant contact may have one or more Requirements
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder (Stage 00.2.2 Founder Decision 2)
Category: Product

### Context
Stage 00.2.2 CTO verification identified that the original analysis silently claimed "one active requirement per contact is sufficient." No frozen governance source supported this cardinality limit. The Founder resolved the question.

### Decision
A Buyer or Tenant contact may have **one or more Requirements** in V001. V001 must not artificially restrict a Buyer/Tenant to a single Requirement. This supports real broker cases where the same client may have different simultaneous property needs.

The product-level minimum:
> A Buyer/Tenant contact can have multiple distinct Requirements, and each Requirement can independently participate in Matching.

Capture First → Enrich Later is preserved: a Requirement with only property type and budget range is a valid, complete record regardless of how many other Requirements the same contact holds.

### What Is NOT Decided Here
Active/inactive requirement status · maximum number of requirements · requirement priority · requirement version history · requirement expiration · database cardinality implementation · schema relationships · UI tabs · requirement grouping.

### Consequences
Requirements are an additive, separate-workflow demand-record. They do not increase the burden of basic Contact capture. Multiple Requirements per contact strengthen Matching input depth.

---

## [DEC-020] — One editable running note per Contact and per Property in V001
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder (Stage 00.2.2 Founder Decision 3)
Category: Product

### Context
Stage 00.2.2 CTO verification identified that the original analysis inferred "single note" from a planned schema column (DATABASE_RULES.md `contacts.notes TEXT`) while Stage 00.2.1 had explicitly said "Persistence TBD." The Founder resolved the product behavior question.

### Decision
For V001:
- **Contact Notes:** Each Contact may have one editable running internal note. The broker can read and update it.
- **Property Notes:** Each Property may have one editable running internal note. The broker can read and update it. Property Notes remain distinct from Property Description.

This is product behavior only. It does not permanently prevent future versions from expanding Notes into multiple notes, a timeline, note history, dated entries, or an activity log.

### What Is NOT Decided Here
Database column · data type · storage structure · timestamps · versioning mechanism · rich text · audit log · note history persistence.

### Consequences
Notes are one editable running plain-text annotation per record in V001. They must not evolve into task management, deal tracking, or threaded communication within V001.

---

## [DEC-021] — Formal Freeze: Stage 00.2.2 — Minimum Capability Analysis
Date: 2026-08-13
Status: ACTIVE — PERMANENT FREEZE RECORD
Decided by: Founder + CTO
Category: Governance (Category A — highest risk)
Authorization: Founder verbal authorization — "نفذ ال correction و ال verification و اقفل المرحة دي"

### Decision
Stage 00.2.2 — Minimum Capability Analysis is **FROZEN and APPROVED** as of 2026-08-13.

The minimum capability definitions documented across Stage 00.2.2 are the authoritative, locked definition of the minimum product behavior required for each of the 15 V001 capabilities.

### Frozen Content Summary
See `STAGE_00_2_2_FREEZE.md` for the full formal record. Summary:
- **Three Founder decisions:** Bidirectional Matching (DEC-018) · One-or-more Requirements per Buyer/Tenant (DEC-019) · One editable running note per Contact and per Property (DEC-020)
- **Two CTO corrections applied:** Property Location visual selection method neutralized (not categorically excluded); Authentication session-lifetime specificity removed (deferred to Foundation/Auth stage)
- **15 IN V001 minimum capability definitions frozen:** see STAGE_00_2_2_FREEZE.md §Minimum Capability Definitions
- **Capture First and 10–15 second basic capture target confirmed intact**
- **Capture → Organize → Act confirmed fully covered**
- **North Star (bidirectional Matching) confirmed strengthened without scope creep**

### Change Process
Any future change to Stage 00.2.2 content requires Change Policy Category A: Founder written approval → exact diff shown → Founder confirms → applied → new DECISIONS.md entry logged. Silent edits during implementation sessions are prohibited (Rule 6).

### What Is NOT Locked by Stage 00.2.2
All schema, architecture, integration mechanisms, UI flows, visual selection methods, session lifetime, Kuwait area taxonomy, storage provider, auth provider, and market configuration specifics remain deferred to their respective stages. See `STAGE_00_2_2_FREEZE.md` — "What Is NOT Frozen" table.

### Implementation Status
PRE-IMPLEMENTATION confirmed. Zero product code written or modified. Stage 00.2.3 has NOT started — WAITING for separate Founder authorization.

---

## [DEC-022] — V001 BASIC capture minima, Contact role rule, and Requirement Purpose rule
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder (Stage 00.3 approval)
Category: Product

### Context
Stage 00.3 required formal Founder approval of the minimum capture fields for Contact, Property, and Requirement, as well as resolution of two closely related rules: whether Contact role is required at capture time, and whether Requirement Purpose may be inferred from Contact role.

### Decision
**Contact BASIC capture minimum:** Name + Phone Number. A Contact with Name and Phone Number is a valid saved record. No additional fields are required for initial validity.

**Contact role:** Role assignment is NOT required to save a Contact. Role is enrichment. A Contact may exist without a role. Role may be assigned during initial capture or at any later time. The four allowed roles remain exactly: Tenant · Buyer · Owner · Broker. Multi-role Contacts are supported. No fifth role.

**Property BASIC capture minimum:** Property Type · Purpose (Sale or Rent) · Price · Market-configured Location Area. Optional enrichment must not block BASIC capture.

**Requirement BASIC capture minimum:** Property Type · Purpose (Buy or Rent) · Budget Range. Purpose belongs explicitly to the Requirement — it may NOT be inferred solely from Contact role, because Contacts may be multi-role. A Requirement must belong to a Contact holding at least one of: Buyer role, Tenant role. Owner-only and Broker-only Contacts may not own Requirements.

**Contact Import validity:** Import should populate all available source information automatically. Before saving an imported Contact as a valid record, Name and Phone Number must exist. If either is unavailable from the source, the broker provides only the missing minimum value. Role remains optional at import time.

**BASIC capture target:** Approximately 10–15 seconds for each of Contact, Property, and Requirement.

### Consequences
Capture First → Enrich Later is mandatory. Optional enrichment may never become a mandatory prerequisite for valid BASIC capture unless a future Founder-approved scope change explicitly changes this rule.

---

## [DEC-023] — Matching ≥70% visibility threshold and deferred scoring formula
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder (Stage 00.3 approval)
Category: Product (Rule 12)

### Context
Stage 00.3 required resolution of (a) which Matching results are surfaced to the broker, (b) whether the scoring formula is defined at this stage, and (c) whether a zero-match result is a valid product outcome.

### Decision
**Visibility threshold:** Only Matching results scoring ≥70% are surfaced to the broker. Results below 70% are not shown.

**Zero qualifying matches:** If no record reaches 70%, the product presents "No Matches ≥70%" — this is a valid and successful Matching outcome. The system must not surface weak matches to avoid an empty result.

**Scoring formula: FULLY DEFERRED.** The following are not defined at Stage 00.3 and must not be assumed: scoring weights, coefficients, relative field importance, mandatory criteria, soft criteria, penalties, mathematical formula, or algorithm implementation.

**Explanation:** The product must explain the score/result using relevant matching reasons. The exact explanation structure, matching fields used in scoring, and explanation presentation remain deferred to the Implementation stage.

**Matching architecture protection:** The future Matching implementation must permit scoring logic to evolve without requiring unnecessary reconstruction of the entire Matching layer. The exact scoring architecture remains deferred. This statement protects future flexibility only.

### Consequences
Both Matching directions (J-06 and J-07) operate under the ≥70% threshold. Matching remains broker-initiated, non-automatic, non-background, non-notification-driven. No cross-broker matching. No AI/ML.

---

## [DEC-024] — Property Sharing recipient: any saved Contact
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder (Stage 00.3 — overrides prior Stage 00.3 analysis recommendation)
Category: Product

### Context
The initial Stage 00.3 analysis recommended restricting Property Sharing recipients to Buyer/Tenant contacts only (FD-1 Option A). The Founder reviewed this recommendation and overrode it.

### Decision
V001 Property Sharing may target any saved Contact, including: Tenant · Buyer · Owner · Broker · Contact with no role assigned.

Conditions that remain unchanged: the sharing action is private · broker-initiated · directed at one specific Property · directed at one specific Contact · conducted via WhatsApp or WhatsApp Business.

Private one-to-one sharing with a Broker Contact is NOT Broker-to-Broker Marketplace behavior. Broker-to-Broker Marketplace remains OUT OF V001.

### What Is NOT Decided Here
Sharing payload format · Property card design · UX entry point · Property-first vs Contact-first selection sequence · technical WhatsApp mechanism.

### Consequences
J-08 (Share Property with Contact) has no role restriction on the recipient. Any saved Contact with a phone number is a valid recipient. Marketplace, bulk, public, automated, and scheduled sharing remain out of V001.

---

## [DEC-025] — Authentication / Language / Profile first-run behavior and Arabic/RTL default
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder (Stage 00.3 — resolves FD-2)
Category: Product + UX

### Context
Stage 00.3 analysis identified FD-2: whether User Profile setup or Language selection is a mandatory first-run gate after authentication. The analysis presented two options. The Founder resolved this.

### Decision
After successful authentication, the broker may immediately begin productive use. There is no mandatory Profile-completion gate. There is no mandatory Language-selection gate.

**Default V001 language: Arabic — RTL.** Device locale is NOT the frozen default. English remains user-selectable. The broker may change language later through the app's language preference control.

Profile enrichment is optional and may occur at any time. Profile is not a prerequisite for Properties, Contacts, Requirements, Matching, Search, or Sharing.

### What Is NOT Decided Here
Exact UI location of the language preference control · exact Profile field set beyond what is already frozen elsewhere · localization SDK or technical implementation.

### Consequences
J-01 (Authenticate) and J-14 (Configure Profile and Language) are independent journeys. All other journeys are accessible immediately after authentication. Arabic/RTL is the product's pre-configured default; the broker may change it at any time without a first-run gate.

---

## [DEC-026] — Formal Freeze: Stage 00.3 — Core User Journeys Lock
Date: 2026-08-13
Status: ACTIVE — PERMANENT FREEZE RECORD
Decided by: Founder + CTO
Category: Governance (Category A — highest risk)
Authorization: Founder/CTO review and approval of corrected Stage 00.3 analysis + CTO precision correction pass

### Decision
Stage 00.3 — Core User Journeys Lock is **FROZEN and APPROVED** as of 2026-08-13.

The core user journey inventory, minimum capture definitions, matching behavior rules, and product-level behaviors documented across Stage 00.3 (DEC-022 through DEC-026 as they relate to core user journeys) are the authoritative, locked definition of the minimum product journey model for ViewState V001.

### Frozen Content Summary
See `STAGE_00_3_FREEZE.md` for the full formal record. Summary:
- **15 journeys frozen:** J-01 Authenticate · J-02 Create Contact · J-03 Create Property · J-04 Create Requirement · J-05 Import Contact · J-06 Match Requirement→Properties · J-07 Match Property→Requirements/Clients · J-08 Share Property with Contact · J-09 Communicate with Contact · J-10 Enrich Contact · J-11 Enrich Property · J-12 Enrich Requirement · J-13 Classify Contact or Property · J-14 Configure Profile and Language · J-15 Global Search and Retrieve
- **Minimum capture frozen:** Contact (Name + Phone) · Property (Type + Purpose + Price + Location Area) · Requirement (Type + Purpose + Budget Range)
- **Matching threshold frozen:** ≥70% visibility · scoring formula deferred · zero qualifying matches valid
- **Four Founder decisions recorded:** DEC-022 (capture minima + role/purpose rules) · DEC-023 (matching threshold) · DEC-024 (sharing recipient) · DEC-025 (auth/language/profile)

### Change Process
Any future change to Stage 00.3 content requires Change Policy Category A: Founder written approval → exact diff shown → Founder confirms → applied → new DECISIONS.md entry logged.

### Implementation Status
PRE-IMPLEMENTATION confirmed. Zero product code written or modified. Stage 00.4 has NOT started — WAITING for Founder authorization.

---

_New decisions are appended here as they are made. Entries are never deleted._
## [DEC-027] — V001 Product Success Definition and 35 Release-Blocking Conditions
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder + CTO (Stage 00.4 approval)
Category: Product acceptance

### Context
Stage 00.4 required establishing an authoritative, frozen definition of what V001 product success means and what conditions would mean V001 must not be accepted as functionally complete.

### Decision
**V001 is considered functionally successful when all five of the following are demonstrably true:**
1. A broker can create a valid Contact (Name + Phone), Property (Type + Purpose + Price + Location Area), or Requirement (Type + Purpose + Budget Range) in a single fast action without required optional enrichment — and the saved record is immediately usable.
2. A broker can initiate Matching in both directions (Requirement→Properties and Property→Requirements/Clients), receive scored results (0–100) at ≥70%, see an explanation using relevant matching reasons, and receive "No Matches ≥70%" when no record qualifies. Neither direction may be absent.
3. A broker can locate any Contact or Property through a quickly accessible Global Search across four approved fields, share a specific Property with any saved Contact via WhatsApp or WhatsApp Business, and initiate communication with any Contact through WhatsApp or WhatsApp Business.
4. Every broker's Contacts, Properties, Requirements, Notes, and Matching results are completely invisible to every other broker.
5. The product renders in Arabic (RTL) by default. English (LTR) is selectable. Broker enters full productive use immediately after authentication — no mandatory Profile gate, no mandatory Language gate.

**35 Release-Blocking Conditions:** See `STAGE_00_4_FREEZE.md` for the full numbered list. Any single condition being true means V001 must not be accepted as functionally complete. Key coverage: both Matching directions; ≥70% threshold; explained results; Capture First for all three entity types; Property four-field minimum; Requirement Purpose explicit (not from Contact role alone, UX pre-fill from prior explicit broker choice permitted if reviewable/changeable); Property Sharing to any saved Contact; both WhatsApp AND WhatsApp Business available; all three Contact Import sources present; multi-role Contact capability; multiple Requirements per Buyer/Tenant; both Arabic/RTL and English/LTR functional; per-broker data isolation; all three media types on Properties; Contact Notes; Property Notes; all four Global Search concepts individually searchable when matching records exist; no OUT OF V001 features.

---

## [DEC-028] — V001 Three-Level Success Model (Separate Levels Mandatory)
Date: 2026-08-13
Status: ACTIVE
Decided by: Founder + CTO (Stage 00.4 approval)
Category: Product acceptance governance

### Decision
V001 success must be evaluated at three separate, non-collapsed levels:

**Level 1 — Product Definition Acceptance (Stage 00.4):** Product behavior is correctly and completely specified at a level sufficient to guide implementation. Closed by Stage 00.4.

**Level 2 — Implementation Acceptance (Implementation + Testing stages):** A working implementation satisfies each frozen journey's PASS conditions, release-blocking conditions are absent, and all 15 capabilities are present and verifiable by technical and functional testing. 10–15 second capture target assessed by structured task-timing test.

**Level 3 — Beta Acceptance (Beta stage):** Real broker users in actual field conditions can successfully complete the primary journeys. 10–15 second target validated by real-user usability testing in Arabic.

**Rationale:** Collapsing Product Definition with Implementation testing creates premature commitments. Collapsing Implementation with Beta conflates technical correctness with real-user usability.

### Consequences
Stage 00.4 closes Level 1 only. Levels 2 and 3 are separate future stages with separate evaluation methods and separate evidence requirements.

---

## [DEC-029] — Formal Freeze: Stage 00.4 — V001 Success & Acceptance Lock
Date: 2026-08-13
Status: ACTIVE — PERMANENT FREEZE RECORD
Decided by: Founder + CTO
Category: Governance (Category A — highest risk)
Authorization: Founder analysis approval + CTO precision correction passes (C1–C6, four wording fixes, search precision) + Founder freeze authorization

### Decision
Stage 00.4 — V001 Success & Acceptance Lock is **FROZEN and APPROVED** as of 2026-08-13.

The product success definition, per-journey acceptance criteria, cross-product acceptance criteria, 35 release-blocking conditions, and three success levels documented in Stage 00.4 are the authoritative, locked definition of what constitutes a complete and acceptable ViewState V001 product.

### Frozen Content Summary
See `STAGE_00_4_FREEZE.md` for the full formal record. Summary:
- **V001 Product Success Definition:** 5 statements covering Capture, Matching, Act, Privacy, and Language/Access
- **15 journey acceptance criteria:** J-01 through J-15, each with preconditions, PASS conditions, valid empty/failure states, FAIL conditions, and explicitly not tested items
- **Cross-product criteria:** Capture→Organize→Act · Private Per-Broker · Bilingual · Capture First · Matching North Star
- **35 release-blocking conditions:** any single condition = V001 not acceptable
- **Three success levels:** Product Definition (Level 1, closed by Stage 00.4) · Implementation (Level 2) · Beta (Level 3)
- **Governance consistency:** No Category D or E findings; all open items are Category B or C

### Change Process
Any future change to Stage 00.4 content requires Change Policy Category A: Founder written approval → exact diff shown → Founder confirms → applied → new DECISIONS.md entry logged.

### Implementation Status
PRE-IMPLEMENTATION confirmed. Zero product code written or modified. Stage 01 has NOT started — WAITING for Founder authorization.


---

## [DEC-030] — V001 Person Classification Model
Date: 2026-08-25
Status: ACTIVE
Decided by: Founder
Category: Product

### Context

The historical V001 role model used Tenant, Buyer, Owner, and Broker. The approved reconciliation replaces the demand-side split and adds the operational classifications required by V001.

### Decision

V001 supports exactly these five Person classifications:

- Seeker / باحث
- Owner / مالك
- Broker / دلال
- Real Estate Company / شركة عقارية
- Building Guard / حارس

Tenant and Buyer are replaced by one demand-side classification: Seeker.

A Seeker may own multiple independent Requirements. Requirements remain separate records and are never stored as Contact Notes.

Each Requirement contains its own purpose:

- Rent
- Buy

Purchase versus rental intent belongs to the Requirement, not the Person classification.

### Supersedes

This decision supersedes the future-implementation effect of DEC-004 and related Stage 00.3/00.4 rules that limit V001 to Tenant, Buyer, Owner, and Broker. Historical records remain unchanged.

### Consequences

All role values, validation rules, Requirement ownership rules, import flows, matching eligibility rules, and user-visible classification lists must use this model.

---

## [DEC-031] — Mandatory Role-first Person Capture
Date: 2026-08-25
Status: ACTIVE
Decided by: Founder
Category: Product + UX

### Decision

Adding a Person begins by selecting at least one approved classification. The user then chooses Add manually or Import from phone or another approved source.

At least one classification is required before final save. Multi-role support is required. Classifications may be changed later without losing Person data, Requirements, or relationships.

Minimum manual save requires Name, Phone, and at least one classification. No additional enrichment field is mandatory.

Imported names and notes must be preserved literally. Imported values must not be translated, silently rewritten, or discarded.

### Supersedes

This decision supersedes the future-implementation effect of DEC-022 and Stage 00.4 rules stating that a Contact may be finally saved without a role. Historical records remain unchanged.

### Consequences

A zero-classification Person may exist only as an unsaved or recoverable Draft/import state, not as a valid final saved Person record.

---

## [DEC-032] — V001 Tasks and Follow-ups Minimum Scope
Date: 2026-08-25
Status: ACTIVE
Decided by: Founder
Category: Product

### Decision

V001 includes fast Task or Follow-up creation; a short title as the only mandatory field; optional date and time; optional links to a Person, Property, or Requirement; Open and Done statuses; Today, Upcoming, All, and Done views; a simple calendar filter; local notification when date/time is selected and permission is granted; edit, complete, and reopen; and Draft preservation with no silent loss.

V001 excludes recurring Tasks, workflow automation, pipelines, team assignment, Google Calendar synchronization, Apple Calendar synchronization, and advanced productivity analytics.

### Supersedes

This decision supersedes the V001 exclusion of all Tasks and Follow-ups. It does not alter the separate four follow-up classification labels: Follow Up, Important, Pending, and Order Complete / Closed Deal. Those labels remain a separate lightweight classification capability and are not Tasks.

### Consequences

The Task capability requires its own Draft, persistence, notification permission, failure recovery, testing, and privacy rules.

---

## [DEC-033] — Property Import and Safe Share Boundary
Date: 2026-08-25
Status: ACTIVE
Decided by: Founder
Category: Product + Integration

### Decision

Property Import is included in V001. Manual Property entry remains permanently available.

ViewState may receive Property-related content shared from WhatsApp Business, WhatsApp, and other operating-system-supported share sources. Supported incoming content may include text, photos, videos, and documents. Manual text paste is supported.

Property Import creates a Draft first. Only supported fields may be extracted. The broker must review and edit extracted data before final save. Original received content remains available when extraction is incomplete, and extraction failure leaves the content available for manual completion.

ViewState does not access private WhatsApp conversations and does not promise unsupported or private WhatsApp APIs. WhatsApp Business is the operational priority, but the integration remains replaceable.

Property Safe Share is limited to one Property at a time, with Preview before sending and field/media selection. WhatsApp Business appears first, followed by WhatsApp and other supported channels.

Owner data, source information, private Notes, exact location, and PACI are not included automatically. Bulk Property Export is excluded from this workflow.

Full-account backup/data portability is a separate capability. ViewState Card and direct ViewState-to-ViewState sharing require a separate later stage.

### Supersedes

This decision supersedes Stage 00.4 release blockers that treat Property Import as prohibited and Full Export as the only relevant export boundary. Historical records remain unchanged.

---

## [DEC-034] — Draft Save and No-Silent-Loss Recovery
Date: 2026-08-25
Status: ACTIVE
Decided by: Founder
Category: Data + UX + Architecture

### Decision

Every add or edit operation maintains an independent Draft. Draft data is saved locally during entry and when the app moves to the background. Drafts must be recoverable after app closure, app crash, phone restart, connection failure, or session failure.

A new Property, Person, Requirement, Task, or Follow-up form must never contain data from a previous completed record.

A Draft may be cleared only after confirmed successful final persistence or explicit user-confirmed discard.

Save failure must preserve all entered fields and media, show a clear message, and provide Retry without requiring re-entry.

Editing must not mutate the persisted original record until final save succeeds. Selected photos and videos must be retained in app-controlled storage and must not depend only on temporary picker paths.

Drafts must not be silently deleted. Multiple Drafts remain distinguishable and recoverable. Local Drafts remain private and are not automatically shared or uploaded. Server-backed Draft synchronization requires a separate Impact Analysis and approval.

### Consequences

This decision does not prematurely freeze debounce timing, storage technology, or schema.

---

## [DEC-035] — Explicit Per-share Disclosure Policy
Date: 2026-08-25
Status: ACTIVE
Decided by: Founder
Category: Privacy + Product

### Decision

Every Property share presents a final Preview showing exactly what will be shared.

Owner identity, owner phone, and source information are hidden by default. A user may enable a specific owner/source field for that share only, with a clear warning and explicit confirmation. The choice is not remembered for later shares.

Private Notes can never be included through the normal Property Share flow.

Exact location, Google Maps link, and PACI are disabled by default. Each may be enabled explicitly for that share.

General area, approved specifications, price, and selected media may be shared normally. No linked Seeker or client information may be exposed.

Sharing begins only after recipient, channel, and Preview are confirmed. The same disclosure rules apply to every channel. Share failure must not modify or delete the Property, Draft, or media.

### Consequences

Privacy filtering must be enforced outside presentation-only UI and must apply consistently to every supported share adapter.

---

## [DEC-036] — PACI, Location, and Maps Behavior
Date: 2026-08-25
Status: ACTIVE
Decided by: Founder
Category: Product + Data + Integration

### Decision

Kuwait Property location selection uses Governorate and Area. Area selection supports fast text search and displays complete names. The taxonomy remains configurable for future GCC expansion.

PACI and exact location are optional and never block Property save.

Location may be provided by map-point selection, current location after permission, a pasted Google Maps link, or manual entry/correction.

Coordinates use a platform-neutral representation. Original user-provided map links are preserved.

Maps, reverse geocoding, and automated lookup must not silently override the user’s selected Area or PACI. The user may correct Area, PACI, map link, and coordinates.

Permission denial, offline state, and map failure must not prevent saving the Property or its Draft.

Google Maps is the first operational map option. Maps use a replaceable adapter. iOS provides an appropriate Apple Maps or browser fallback.

Exact location and PACI remain private by default during sharing. Movement history is not collected. Any external PACI integration requires separate privacy, reliability, replacement, failure, and data-authority analysis before approval.

---

## [DEC-037] — Cross-Platform Android/iOS Product Contract
Date: 2026-08-25
Status: ACTIVE
Decided by: Founder
Category: Architecture + Product + Testing

### Decision

ViewState App V001 is one product supporting Android and iOS/iPhone.

Android is the first implementation, pilot, and operational-validation platform. Android-first does not authorize an Android-only architecture.

iOS architectural compatibility must be maintained continuously during every implementation stage.

After Android stabilization, the remaining iOS-specific work may include only remaining platform integrations, real-device verification, TestFlight verification, and App Store preparation.

Shared product behavior, domain logic, validation, matching, persistence, API contracts, migrations, privacy, and backup rules remain platform-neutral.

Business rules must never be duplicated inside platform-specific UI or native modules.

Native functions must be isolated behind replaceable platform adapters, including Contacts; Photos and videos; Files and backup/restore; Location and maps; WhatsApp and WhatsApp Business; Notifications; Secure storage and authentication; Deep links; and future ViewState Card opening.

Every dependency requires Android, iOS, and Expo compatibility review.

A platform-specific dependency requires documented justification, a safe equivalent fallback, isolation from shared product logic, and Founder approval if it reduces parity or data safety.

Persisted data, migrations, backup formats, import/export formats, and future ViewState Card formats remain platform-neutral.

Android hardware and gesture back behavior and iOS native swipe-back/navigation behavior must both be respected.

Arabic, English, RTL/LTR, keyboard behavior, accessibility, and responsive layout must be verified on both platforms.

Every future feature Impact Analysis requires an Android/iOS Compatibility Impact section.

Android real-device testing is mandatory for the first pilot, including Honor X9 where applicable.

iPhone real-device and TestFlight testing are mandatory before iOS freeze or App Store submission.

TypeScript success, Expo prebuild, simulator success, or binary generation alone is not proof of iOS functional readiness.

Historical permanent single-platform priority statements are superseded. Android-first is rollout and operational-testing priority only.

Platform parity means equivalent product capability and data safety, not identical native UI behavior.

### Supersedes

This decision supersedes the platform-priority portions of artifacts/mobile/.ai/README.md:10-12, artifacts/mobile/.ai/ARCHITECTURE.md:8-22, and artifacts/mobile/.ai/DECISIONS.md:80-93, only to the extent that they establish permanent iOS priority or postpone Android compatibility. Historical records remain unchanged.

### Consequences

A feature is not architecturally complete when it works only on Android without a documented iOS path. Android may reach pilot readiness first, but iOS compatibility work continues during every preceding implementation stage. Tooling/build success alone cannot establish functional readiness.
