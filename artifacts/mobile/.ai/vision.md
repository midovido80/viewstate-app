# ViewState App — Vision

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Problem Statement

Real estate transactions in the Arab world — particularly in Egypt — are overwhelmingly conducted through informal channels: WhatsApp groups, word-of-mouth, and broker networks with no digital trail. Buyers and sellers have no reliable way to find each other directly, property data is unstructured, and agents hoard information rather than share it.

ViewState exists to fix this.

---

## Vision

> A lean, bilingual (Arabic/English) mobile platform that lets real estate professionals manage their property inventory and buyer requirements — and get matched automatically when a fit exists.

ViewState is not a public marketplace. It is a **professional tool** for agents, brokers, and serious private sellers/buyers. Think of it as the CRM and matching engine that WhatsApp groups wish they were.

---

## North-Star Metrics (post-launch)

| Metric | Description |
|--------|-------------|
| Match rate | % of listed properties that generate at least one qualified match per week |
| Conversion rate | % of matches that result in a viewing appointment |
| Data quality | % of properties with complete required fields |
| Retention | % of users active after 30 days |

---

## Personas

### Persona 1: The Broker (سمسار)
- Age 30–55, Egyptian, Arabic-first
- Manages 20–200 properties in their head + WhatsApp
- Pain: loses deals because they can't remember which client wanted what
- Goal: digitize their inventory and get notified when a match appears

### Persona 2: The Private Buyer (مشتري)
- Has a budget and specific requirements
- Pain: has to contact 10 brokers to find 3 relevant listings
- Goal: describe what they want once, get matched to relevant properties

### Persona 3: The Admin / Founder
- Manages the platform, approves broker accounts
- Pain: no visibility into what's happening on the platform
- Goal: a simple dashboard to see activity and intervene when needed

---

## Product Scope (Beta)

### In scope
- Broker registration and profile
- Property listing (Arabic/English fields)
- Buyer requirement entry
- Automatic matching (rule-based, not AI)
- WhatsApp chat import for contact/lead extraction
- Contacts integration (read phone contacts, link to buyers/brokers)
- Basic media upload (photos per property)
- Bilingual UI (RTL Arabic / LTR English)

### Out of scope (v1)
- Public consumer marketplace
- AI-powered valuation
- Payment / commission tracking
- Full CRM workflows
- Web version

---

## Guiding Principles

1. **Arabic first:** The primary user speaks Arabic. The app must feel native in Arabic, not like a translated English app.
2. **WhatsApp-native:** Brokers live in WhatsApp. Import flows must feel familiar and frictionless.
3. **Lean beta:** Ship the smallest thing that creates a match. Every feature must earn its place.
4. **Trust by design:** Real estate requires trust. No dark patterns, no hidden data sharing.
5. **Offline-tolerant:** Mobile data in Egypt is inconsistent. The app must degrade gracefully.
