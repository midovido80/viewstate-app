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

_New decisions are appended here as they are made. Entries are never deleted._
