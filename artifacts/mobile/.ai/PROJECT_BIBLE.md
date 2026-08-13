# ViewState App — Project Bible

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Problem Statement

Real estate transactions in the Arab world — particularly Egypt — are overwhelmingly conducted through informal channels: WhatsApp groups, word-of-mouth, and broker networks with no digital trail. Buyers and sellers have no reliable way to find each other directly, property data is unstructured, and agents hoard information rather than share it.

ViewState exists to fix this.

---

## Vision

> A lean, bilingual (Arabic/English) mobile platform that lets real estate professionals manage their contacts, property inventory, and buyer requirements — and get matched automatically when a fit exists.

ViewState is not a public marketplace. It is a **professional tool** for agents, brokers, and serious private sellers/buyers. Think of it as the CRM and matching engine that WhatsApp groups wish they were.

---

## V001 Product Scope (Governance Rule 9)

### IN SCOPE — V001
| Feature | Description |
|---------|-------------|
| Contacts | Manage buyer/seller/tenant/broker contacts with profiles and requirements |
| Properties | Create and manage property listings with bilingual fields |
| Matching | Rule-based Compare + Score + Explain matching between buyers and properties |
| Import/Export | WhatsApp chat import, device contacts import |
| Global Search | Available from every primary screen — search across contacts and properties |
| User Profile | Broker profile, language settings, basic preferences |
| Arabic/English | Full bilingual support with RTL/LTR switching |

### OUT OF SCOPE — Deferred, not V001
| Feature | Status |
|---------|--------|
| Tasks & Follow-up system | Deferred |
| Deals & transaction tracking | Deferred |
| Commission calculation | Deferred |
| Reports & analytics dashboards | Deferred |
| Network Marketplace (public listings) | Deferred |
| Advanced AI chat / AI assistant | Deferred |
| Voice assistant | Deferred |
| Payment processing | Deferred |
| Web version | Deferred |

---

## Core Principle: Capture First → Enrich Later (Rule 10)

Every data entry flow follows this principle:
- **Minimal required fields only** on first entry
- **Optional details** accessible via "Edit" after capture
- Never block a user from saving with excessive required fields
- A contact with only a name and phone number is a valid, complete record
- A property with only type, purpose, price, and governorate is a valid, complete record

---

## Contact Roles — V001 (Governance Rule 11)

ViewState V001 supports exactly four contact roles. No others.

| Role (EN) | Role (AR) | Description |
|-----------|-----------|-------------|
| **Buyer** | مشتري | Looking to purchase a property |
| **Tenant** | مستأجر | Looking to rent a property |
| **Owner** | مالك | Has a property to sell or rent |
| **Broker** | سمسار / وسيط | A real estate agent or broker |

- A contact may have multiple roles (e.g., both Buyer and Broker)
- Role determines which flows are available (Buyer/Tenant → Requirements; Owner → Properties)

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
- Searches across: property titles, contact names, phone numbers, governorates
- Results grouped by entity type: Properties / Contacts
- Accessible with a single tap — no buried navigation

---

## Personas

### Persona 1: The Broker (سمسار)
- Age 30–55, Egyptian, Arabic-first
- Manages 20–200 contacts and properties via WhatsApp
- Pain: loses deals because they can't track which client wanted what
- Goal: digitize their inventory, manage contacts, get notified when a match appears

### Persona 2: The Buyer / Tenant
- Has a budget and specific requirements
- Pain: has to contact 10 brokers to find 3 relevant listings
- Captured as a contact in a broker's ViewState — not a direct app user in V001

### Persona 3: The Admin / Founder
- Manages the platform, monitors usage
- Goal: visibility into platform activity

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

1. **Arabic first.** The primary user speaks Arabic. The app must feel native in Arabic, not like a translated English app.
2. **WhatsApp-native.** Brokers live in WhatsApp. Import flows must feel familiar and frictionless.
3. **Lean beta.** Ship the smallest thing that creates a match. Every feature must earn its place.
4. **Capture First → Enrich Later.** Minimal friction at data entry. Optional richness later.
5. **Trust by design.** No dark patterns, no hidden data sharing, no surprises.
6. **Offline-tolerant.** Mobile data in Egypt is inconsistent. The app must degrade gracefully.
