# ViewState App — Decisions Log

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## How to Use This Log

Every significant architectural, product, or tooling decision is recorded here **before** implementation. Log entries are immutable — once written, they are never deleted (mark as SUPERSEDED if a decision is reversed).

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
[Why this option over alternatives?]

### Alternatives considered
- [Option A]: rejected because [reason]
- [Option B]: rejected because [reason]

### Consequences
[What does this decision lock in? What does it prevent?]

### Superseded by
[DEC-XXX if this was reversed]
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
The project is being started from scratch. The Founder wants to ensure all future AI sessions are tightly controlled and the product is built layer-by-layer with explicit approval gates.

### Decision
The very first action in the project is establishing the Governance Package. No product feature is implemented until governance is complete and the Founder explicitly unlocks each layer.

### Rationale
Without governance, AI sessions tend to over-build, make autonomous decisions, and create technical debt that is hard to reverse. The Governance-first approach gives the Founder control over every decision.

### Alternatives considered
- Start with a working MVP first, add governance later: rejected because governance retrofitted after code exists is ignored.
- Use a project management tool (Linear, Notion): rejected because governance needs to live inside the repo, accessible to every AI session.

### Consequences
Project is in PRE-IMPLEMENTATION state. Nothing is built until Founder says so.

---

## [DEC-002] — Bilingual Arabic/English from day one
Date: 2026-08-13  
Status: ACTIVE  
Decided by: Founder  
Category: UX + Data

### Context
The primary users are Arabic-speaking Egyptian real estate brokers. English is secondary.

### Decision
Every user-facing string has both `ar` and `en` versions. Every text DB column has `_ar` and `_en` variants. The app defaults to Arabic (RTL).

### Rationale
Retrofitting bilingual support after building in one language is expensive and error-prone. Building it in from day one means zero tech debt on this dimension.

### Alternatives considered
- Arabic only: rejected because some users prefer English, and the Founder may want an English-language admin view.
- English primary, Arabic secondary: rejected because the primary user is Arabic-first.

### Consequences
All future DB schemas must include `_ar` and `_en` text columns. All i18n keys must be written in both languages before a screen is considered done.

---

## [DEC-003] — React Native + Expo as mobile platform
Date: 2026-08-13  
Status: ACTIVE  
Decided by: Founder  
Category: Architecture

### Context
The product is a mobile-first real estate tool. Platform choice determines developer velocity, native feature access, and long-term maintainability.

### Decision
Use React Native with Expo (SDK 53+). Expo Router for file-based navigation. NativeTabs on iOS 26+.

### Rationale
Expo provides access to device features (contacts, camera, file system) through a JavaScript API, removing the need for a native build environment in development. The Replit environment supports Expo Go for live preview.

### Alternatives considered
- Native Swift/Kotlin: rejected due to higher development cost and no cross-platform support.
- Flutter: rejected because the monorepo is TypeScript-first, and sharing types with the API server is a priority.

### Consequences
Only Expo Go compatible packages may be used in the mobile client.

---

## [DEC-004] — Rule-based matching engine (no AI in v1)
Date: 2026-08-13  
Status: ACTIVE  
Decided by: Founder  
Category: Architecture

### Context
The core value of ViewState is matching buyer requirements to available properties. The implementation approach for matching needs to be decided.

### Decision
v1 matching engine is purely rule-based: field-to-field comparison with weighted scoring. No ML, no embeddings, no vector search.

### Rationale
Rule-based matching is transparent (the Founder can explain any match), debuggable, and requires no AI infrastructure. It can be replaced with a smarter engine in v2 once the data model is validated.

### Alternatives considered
- OpenAI embeddings: rejected for v1 due to latency, cost, and opacity.
- Manual match creation by broker: rejected because it defeats the purpose of the product.

### Consequences
Matching engine logic is deterministic and fully unit-testable. v2 can upgrade to ML without changing the API contract.

---

## [DEC-005] — Auth provider: PENDING FOUNDER DECISION
Date: 2026-08-13  
Status: PENDING  
Decided by: Open  
Category: Architecture

### Context
The app needs user authentication. Phone-number-based auth is preferred given the Arabic market context (WhatsApp-native users expect OTP via SMS).

### Decision
PENDING — awaiting Founder input on:
- Phone OTP vs. email/password
- Auth provider: Clerk (Replit-managed), Replit Auth, or custom

### Options
A) Clerk with phone OTP — managed, supports SMS OTP, good DX  
B) Replit Auth — simplest integration, but less control over UX  
C) Custom phone OTP with Twilio — full control, more infrastructure

---

## [DEC-006] — Object storage provider: PENDING FOUNDER DECISION
Date: 2026-08-13  
Status: PENDING  
Decided by: Open  
Category: Architecture

### Context
Property photos need to be stored and served. Object storage provider needs to be chosen.

### Decision
PENDING — awaiting Founder input.

### Options
A) Replit Object Storage (App Storage) — simplest, no extra account needed  
B) Cloudinary — image optimization and transformation included  
C) AWS S3 — most flexible, requires AWS account

---

_New decisions are added here as they are made._
