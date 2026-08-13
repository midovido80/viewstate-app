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
These four roles cover 100% of the Egyptian broker's immediate use case. Additional roles (investor, developer, etc.) are deferred to V002.

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
- DB column: `classification TEXT` (nullable) constrained to `'follow_up' | 'important' | 'pending' | 'closed'`

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
Category: Architecture + Product

### Context
Governance files previously hard-coded Egypt's 27 governorates as the universal location taxonomy. Decision 2 (GCC-first, generic product) requires this to be market-configurable.

### Decision
ViewState uses a generic `location_area` concept for properties and requirements. The specific taxonomy (governorates, emirates, regions, municipalities, etc.) is market configuration — loaded per deployment, not hardcoded in product code. GCC is the first deployment market; specific location lists for each GCC market are defined in the market configuration stage.

### Consequences
- DB column renamed from `governorate` to `location_area` (properties) and `location_areas` (buyer_requirements)
- All hardcoded Egyptian governorate lists removed from skills files and product code
- Market config layer must provide: location taxonomy label, location options list, phone number format, currency code, and locale tag

---

_New decisions are appended here as they are made. Entries are never deleted._
