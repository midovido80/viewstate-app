# ViewState App — Project Bible

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13 (Stage 00.1 corrections applied)

---

## Problem Statement

Real estate transactions across the GCC and similar markets are conducted through a mix of informal channels: messaging apps, word-of-mouth, and broker networks that leave no structured digital trail. Buyers, tenants, and property owners have no reliable way to connect through an organized broker system. Property data is unstructured, contact requirements are stored informally, and agents manage their entire operation through messaging threads and personal memory.

ViewState exists to fix this.

---

## Vision

> A lean, bilingual (Arabic/English) mobile platform that lets real estate professionals manage their contacts, property inventory, and buyer/tenant requirements — and identify matches when a fit exists.

ViewState is not a public marketplace. It is a **professional tool** for brokers, consultants, and serious real estate professionals. Think of it as the CRM and matching engine that messaging-group-based workflows wish they were.

---

## V001 Product Scope (Governance Rule 9)

### IN SCOPE — V001

| Feature | Description |
|---------|-------------|
| Contacts | Manage buyer/tenant/owner/broker contacts with profiles and roles |
| Properties | Create and manage property listings with bilingual fields |
| Requirements | Capture and manage buyer/tenant requirements linked to contacts |
| Matching | Rule-based Compare + Score + Explain matching between requirements and properties |
| Classification | Lightweight optional status labels on contacts and properties (Follow Up / Important / Pending / Order Complete / Closed Deal) |
| Import | WhatsApp and WhatsApp Business driven capture/import flows (technical mechanism decided in Integration stage); device contacts import |
| Global Search | Available from every primary screen — search across contacts and properties |
| User Profile | Broker profile, language settings, basic preferences |
| Arabic/English | Full bilingual support with RTL/LTR switching |

### OUT OF SCOPE — Deferred, not V001

| Feature | Status |
|---------|--------|
| Full task-management / reminder / automation engine | Deferred — V001 uses 4-label optional classification only; no dates, reminders, or automation |
| Deals & transaction tracking | Deferred — "Order Complete / Closed Deal" is a status label only, not a deal ledger |
| Commission calculation | Deferred |
| Reports & analytics dashboards | Deferred |
| Network Marketplace (broker-to-broker sharing) | Deferred |
| Advanced AI chat / AI assistant | Deferred |
| Voice assistant | Deferred |
| Payment processing | Deferred |
| Web version | Deferred |

---

## Basic Capture Speed Target — V001 Acceptance Target

The following is a hard acceptance target for basic capture flows only:

- Capturing essential information for a **basic Contact** must be achievable in approximately **10–15 seconds**
- Capturing essential information for a **basic Property** must be achievable in approximately **10–15 seconds**
- Capturing essential information for a **basic Requirement** must be achievable in approximately **10–15 seconds**

This target applies to **basic / essential capture only** — not to completing a full enriched record.

This aligns directly with Capture First → Enrich Later: the broker saves useful partial information immediately, then enriches the record later without being blocked by large mandatory forms.

---

## Core Principle: Capture First → Enrich Later (Rule 10)

Every data entry flow follows this principle:

- **Minimal required fields only** on first entry
- **Optional details** accessible via "Edit" after capture
- Never block a user from saving with excessive required fields
- A contact with only a name and phone number is a valid, complete record
- A property with only type, purpose, price, and a location area is a valid, complete record
- A requirement with only property type and a budget range is a valid, complete record

---

## Core Operating Model

**Capture → Organize → Act**

| Phase | What the broker does |
|-------|---------------------|
| **Capture** | Fast entry of contacts, properties, requirements, and optional classifications |
| **Organize** | Structured retrieval, filtering, classification, and global search across all captured data |
| **Act** | Matching results, communication via WhatsApp / WhatsApp Business, status management |

Matching is the primary North Star Act — the broker sees a useful match they would otherwise have missed.

WhatsApp and WhatsApp Business are required communication channels within the broker workflow — they are not the primary definition of what ViewState is.

---

## Contact & Property Classification — V001 Lightweight Status

V001 includes an optional lightweight classification system that can be attached to a Contact or a Property. This is a simple status tag — it is NOT a task engine, reminder system, calendar, pipeline, or deal ledger.

**Approved V001 classification labels (exactly these four):**

| Label (EN) | Label (AR) | Typical use |
|------------|------------|-------------|
| **Follow Up** | متابعة | Broker needs to return to this contact or property |
| **Important** | مهم | High-priority item requiring attention |
| **Pending** | معلق | Awaiting information, a response, or a next step |
| **Order Complete / Closed Deal** | تمت الصفقة | Deal has been successfully completed |

**Rules:**
- Classification is optional — the broker applies it only when needed
- The selected label appears visibly next to the contact name or property title
- Only one label at a time per contact or property
- No dates, no scheduled reminders, no automation, no calendar integration, no pipeline stages
- "Order Complete / Closed Deal" is a classification label — it is NOT a deals-tracking or commission system

---

## WhatsApp & WhatsApp Business — V001 Communication Channels

WhatsApp and WhatsApp Business are both required communication channel options in ViewState V001.

**Product-level rules:**
- When the broker initiates a communication action from a contact or a relevant property workflow, ViewState must present a choice between **WhatsApp** and **WhatsApp Business**
- The selected option opens that specific app
- Both options are equally required — ViewState is not WhatsApp-only

**Integration scope boundary (Stage 00.1 only):**
- The precise technical mechanism (deep links, intents, APIs, export/import flows) is NOT locked at this stage
- Technical integration approach is decided in the Integration stage
- ViewState also supports WhatsApp and WhatsApp Business as data capture/import sources, where approved in the Integration stage
- Do not lock V001 to any single technical integration method at the product-definition level

---

## Contact Roles — V001 (Governance Rule 11)

ViewState V001 supports exactly four contact roles. No others.

| Role (EN) | Role (AR) | Description |
|-----------|-----------|-------------|
| **Buyer** | مشتري | Looking to purchase a property |
| **Tenant** | مستأجر | Looking to rent a property |
| **Owner** | مالك | Has a property to sell or rent |
| **Broker** | سمسار / وسيط | A real estate agent, consultant, or broker |

- A contact may have multiple roles (e.g., both Buyer and Broker)
- Role determines which flows are available (Buyer/Tenant → Requirements; Owner → Properties)

---

## Requirements — V001 (Explicit Core Capability)

Buyer/Tenant Requirements are an explicit, named V001 core capability — not merely implicit inside Matching.

- A Requirement is linked to a Buyer or Tenant contact
- It captures what the contact is looking for: property type, purpose (buy/rent), budget, area, location preference, and other criteria
- Requirements are the demand side of the matching engine
- A Requirement with only property type and a budget range is a valid, complete record (Capture First)
- Requirements drive the Matching engine (Rule 12)

---

## Matching Scope — V001 (Governance Rule 12)

The V001 matching engine does exactly three things:

1. **Compare** — field-by-field comparison between a buyer/tenant requirement and available properties
2. **Score** — calculate a match score (0–100) based on how many criteria align
3. **Explain** — show the broker exactly which fields matched and which didn't

**Not in V001 matching:**
- No ML or AI recommendation
- No vector search or semantic matching
- No automated notifications or push alerts for new matches
- No cross-broker matching (a broker only sees matches within their own inventory)

---

## Global Search — V001 (Governance Rule 13)

Global Search is a core utility, not a secondary feature.

- Available from every primary screen (Properties, Contacts, Matches, Dashboard)
- Lives in the blue top header (per visual baseline — Rule 14)
- Searches across: property titles, contact names, phone numbers, location areas
- Results grouped by entity type: Properties / Contacts
- Accessible with a single tap — no buried navigation

---

## Location Taxonomy — Market-Configurable

ViewState's location concept for properties and requirements is **market-configurable** — no country-specific administrative term is hard-coded into the product definition.

- The product uses a generic **location area** concept (city, district, region, or market equivalent)
- The specific taxonomy (governorates, emirates, regions, municipalities, etc.) is market configuration, loaded per deployment — not a universal product rule
- GCC is the first deployment market — specific location taxonomy for each market is defined during the market configuration stage
- The data model must support loading location options from configuration rather than a hardcoded list

---

## Personas

### Persona 1: The Broker / Consultant (الوسيط / المستشار العقاري)

A real estate professional who works daily from a mobile device with contacts (buyers, tenants, owners, brokers), property listings, and buyer/tenant requirements. Works primarily via messaging apps and direct calls as part of their daily deal flow.

**Goal:** Organize their contact base and property inventory, capture requirements quickly, identify matches, and manage their daily workflow from a mobile device.

### Persona 2: The Buyer / Tenant

Has a budget and specific property requirements. Captured as a contact inside a broker's ViewState — not a direct app user in V001. Does not log in to ViewState in V001.

### Persona 3: The Admin / Founder

Manages the platform, monitors usage. Goal: visibility into platform activity.

---

## Architecture Readiness — Future Features (Governance Rule 17)

These features are NOT built in V001, but the architecture must not block them:

- **AI Brain expansion:** Natural language search, property description generation, smart match suggestions
- **Network Marketplace:** Broker-to-broker property sharing
- **Platform integration:** WhatsApp Business API, CRM integrations
- **Deals & Commission tracking:** Post-match transaction management

Every data model, API contract, and module boundary must be designed with these future capabilities in mind — even if they are not implemented.

---

## Guiding Principles

1. **Arabic first.** The primary user operates primarily in Arabic. The app must feel native in Arabic — bilingual support is structural, not a translation layer.
2. **WhatsApp-native workflow.** Brokers work through messaging apps. Import and communication flows must feel familiar and frictionless.
3. **Lean beta.** Ship the smallest thing that creates a match. Every feature must earn its place.
4. **Capture First → Enrich Later.** Minimal friction at data entry. Optional richness later.
5. **Trust by design.** No dark patterns, no hidden data sharing, no surprises.
6. **Offline-tolerant.** Mobile connectivity in the field may be inconsistent. The app must degrade gracefully.
