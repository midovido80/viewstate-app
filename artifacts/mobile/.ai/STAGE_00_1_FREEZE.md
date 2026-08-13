# Stage 00.1 — Product Purpose & User Lock
## FORMAL FREEZE RECORD

---

**Stage:** 00.1 — Product Purpose & User Lock  
**Status:** 🔒 FROZEN / APPROVED  
**Frozen by:** Founder + CTO  
**Freeze date:** 2026-08-13  
**Authorization:** Founder verbal authorization — "نفذ"  
**Recorded in:** DECISIONS.md DEC-014  

---

## Freeze Declaration

Stage 00.1 — Product Purpose & User Lock is hereby **FROZEN and APPROVED**.

The product-level decisions documented in this stage are the authoritative, locked definition of what ViewState is, who it is for, and what V001 delivers. No implementation session, AI agent, or collaborator may silently alter the substance of any Stage 00.1 decision.

Any future modification to Stage 00.1 content requires an **explicit governed change request** under the Change Policy (Category A — Governance changes), with Founder written approval, an exact diff shown before applying, and a new decision entry logged in DECISIONS.md.

---

## What Is Frozen — Stage 00.1 Approved Decisions

The following product-level decisions are frozen. No implementation detail was locked at this stage; all schema, architecture, integration, and market configuration specifics remain deferred to their respective stages.

### 1. Product Identity
ViewState is a **generic real-estate tool for professional brokers/consultants**, designed to be market-configurable and scalable beyond any single country. It is a professional-grade capture, organization, and action tool — not a consumer listing app, a CRM, a public marketplace, or a project management platform.

### 2. First Operational Market + Expansion
- **Kuwait** is the first operational/deployment market for V001
- **GCC** is the planned expansion region after the Kuwait-first release
- Additional GCC markets provide their own location taxonomies, currencies, phone formats, and locale settings via market configuration
- Kuwait-first is an operational decision — not a product architecture constraint

### 3. Primary User
Real-estate broker or consultant working daily from a mobile device. No demographic assumptions are locked.

### 4. Operating Model
**Capture → Organize → Act.**  
Brokers capture fast, organize contacts and properties, then act through matching, communication, and classification. Matching is the North Star value — not the only value.

### 5. Speed Target
Capturing essential information for a basic Contact or Property must be achievable in approximately **10–15 seconds** for basic capture only. This target applies to the minimum required fields — not to full enrichment.

### 6. V001 Core Capability — Requirements (explicit)
Buyer and tenant requirements are an explicit named V001 feature. They are not implicit inside Matching. Capture, storage, and linking of requirements to contacts is core product work.

### 7. V001 Scope — Fixed and Lean
**In V001:** Contacts · Properties · Requirements · Matching · Classification · Import / WhatsApp + WhatsApp Business communication channels · Global Search · User Profile · Arabic / English  
**Deferred (not V001):** Full task/reminder engine · Deals tracking · Commission · Reports · Network Marketplace · Advanced AI chat · Voice assistant

### 8. Classification System
An optional lightweight 4-label status tag on Contacts and Properties.

| Label (EN) | Label (AR) |
|------------|-----------|
| Follow Up | متابعة |
| Important | مهم |
| Pending | معلق |
| Order Complete / Closed Deal | تمت الصفقة |

Rules: optional; one label at a time per record; visible beside entity name; no dates, reminders, automation, pipeline stages, or calendar integration; "Order Complete / Closed Deal" is a status label only — NOT a deal ledger, transaction tracker, or commission system.

Persistence column name, SQL type, constraint representation, and nullability are **deferred to the Database stage**.

### 9. WhatsApp + WhatsApp Business
Both WhatsApp and WhatsApp Business are required communication channel choices within the broker workflow. The broker sees a choice between them; the selected app opens. Both are also supported as data import/capture sources. Technical mechanism (deep links, intents, APIs, import method) is **deferred to the Integration stage**.

### 10. Location — Market-Configurable Concept
The location concept for properties and requirements is generic and market-configurable. No country-specific location list or administrative term is hard-coded into the core product. Kuwait area taxonomy is the first concrete market configuration — defined in the Market Configuration stage, not here.

Product-level capability locked: property and location workflows must be capable of supporting a Kuwait-first market configuration in which the broker can select from Kuwait areas when entering property data.

### 11. Approved 'Is NOT' Boundaries
- Not a public real-estate listing platform
- Not a consumer-facing property search app
- Not a full CRM or sales pipeline system
- Not a full task/reminder management system
- Not a deals ledger or commission tracker
- Not a reporting/analytics platform
- Not a B2B marketplace for agencies
- Not a locked single-country product

---

## What Is NOT Frozen by Stage 00.1

The following are explicitly deferred — Stage 00.1 makes no claim on any of them:

| Topic | Deferred to |
|-------|------------|
| Auth provider (DEC-008 PENDING) | Foundation stage |
| Object storage (DEC-009 PENDING) | Media stage |
| Database schema, column names, types, nullability, constraints | Database stage |
| Classification persistence representation | Database stage |
| Location field column name, type, nullability | Database stage |
| Kuwait area taxonomy (names, groupings, IDs, source) | Market Configuration stage |
| Market configuration layer design | Architecture stage |
| Currency code defaults and constraints | Database / Market Configuration stage |
| WhatsApp technical mechanism | Integration stage |
| GCC market configurations (post-Kuwait) | Post-Kuwait Market Configuration stages |
| Phone number formats | Market Configuration stage |
| Brand primary blue hex | UI stage |
| Arabic translations (ar.json) | Founder-authored, before UI stage |
| All V001 deferred features | Post-V001 |

---

## Change Policy for Frozen Stage

This stage is governed by **Change Policy Category A — Governance changes** (highest risk).

**Process for any future change to Stage 00.1 content:**
1. Founder proposes the change in writing with rationale
2. AI shows the exact diff of what would change
3. Founder explicitly confirms
4. AI applies the change
5. A new decision entry is logged in DECISIONS.md with date, reason, and reference to this freeze record

**Prohibited without this process:**
- Any AI session silently editing Stage 00.1 product decisions during implementation work
- Any implementation session "updating" Stage 00.1 definitions as a side effect
- Expanding or narrowing V001 scope without a formal change request
- Changing the Kuwait-first market lock without a formal change request

---

## Implementation Status at Freeze

**PRE-IMPLEMENTATION — confirmed.**  
Zero product feature code has been written or modified. The app scaffold is a blank Expo shell with no product UI. All implementation layers remain locked pending explicit Founder authorization.

---

## Next Stage

**Stage 00.2** has NOT started. It remains **WAITING** and must not begin until the Founder explicitly authorizes it.

The Founder may authorize Stage 00.2 at any time by issuing the explicit authorization command for that stage.
