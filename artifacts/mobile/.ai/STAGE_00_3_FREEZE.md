# Stage 00.3 — Core User Journeys Lock
## FORMAL FREEZE RECORD

---

**Stage:** 00.3 — Core User Journeys Lock
**Status:** 🔒 FROZEN / APPROVED
**Frozen by:** Founder + CTO
**Freeze date:** 2026-08-13
**Authorization:** Founder/CTO review and approval of corrected Stage 00.3 analysis + CTO precision correction pass
**Recorded in:** DECISIONS.md DEC-022 · DEC-023 · DEC-024 · DEC-025 · DEC-026
**Analysis documents:** Stage 00.3 Analysis Report · Founder/CTO Correction Pass · CTO Precision Correction

---

## Freeze Declaration

Stage 00.3 — Core User Journeys Lock is hereby **FROZEN and APPROVED**.

The core user journeys, minimum capture definitions, matching behavior rules, and product-level behaviors documented in this stage are the authoritative, locked definition of the minimum product journey model for ViewState V001. No implementation session, AI agent, or collaborator may silently alter the substance of any Stage 00.3 decision.

Any future modification to Stage 00.3 content requires an **explicit governed change request** under the Change Policy (Category A — Governance changes), with Founder written approval, an exact diff shown before applying, and a new decision entry logged in DECISIONS.md.

---

## What Is Frozen — Stage 00.3 Approved Journey Inventory

### 15 Core User Journeys

| J# | Journey | Classification |
|----|---------|---------------|
| J-01 | Authenticate | CORE |
| J-02 | Create Contact | CORE |
| J-03 | Create Property | CORE |
| J-04 | Create Requirement | CORE |
| J-05 | Import Contact | CORE |
| J-06 | Match Requirement to Properties (Direction A) | CORE |
| J-07 | Match Property to Requirements and Clients (Direction B) | CORE |
| J-08 | Share Property with Contact | CORE |
| J-09 | Communicate with Contact | SUPPORTING |
| J-10 | Enrich Contact | SUPPORTING |
| J-11 | Enrich Property | SUPPORTING |
| J-12 | Enrich Requirement | SUPPORTING |
| J-13 | Classify Contact or Property | SUPPORTING |
| J-14 | Configure Profile and Language | SUPPORTING |
| J-15 | Global Search and Retrieve | SUPPORTING |

---

### Journey Success Definitions

**J-01 — Authenticate**
The broker has an authenticated session granting secure access exclusively to their own ViewState data. Authentication is required before productive use. After successful authentication, the broker may immediately begin productive use with no mandatory Profile gate and no mandatory Language-selection gate. Default language: Arabic — RTL. English remains user-selectable. Authentication mechanism, provider, session lifetime, and re-authentication behavior remain deferred.

**J-02 — Create Contact**
A Contact record with at minimum a name and phone number exists in the broker's data, is immediately retrievable, and is available for role assignment and enrichment. Contact role is optional during initial capture. Role may be added later. Approximately 10–15 second BASIC capture target.

**J-03 — Create Property**
A Property record with at minimum a type, purpose (sale/rent), price, and market-configured location area exists in the broker's inventory and becomes eligible for broker-initiated Matching. Optional enrichment must not block BASIC capture. Approximately 10–15 second BASIC capture target.

**J-04 — Create Requirement**
A Requirement record — with at minimum a property type, an explicit purpose (buy/rent), and a budget range — exists linked to a Buyer/Tenant Contact and becomes eligible for broker-initiated Matching. Purpose belongs explicitly to the Requirement and is not inferred solely from Contact role. A Buyer/Tenant Contact may have one or more independently captured Requirements. Approximately 10–15 second BASIC capture target.

**J-05 — Import Contact**
A Contact record exists in the broker's data, created from an external source (WhatsApp / WhatsApp Business / device contacts). Import populates all available source information automatically. The broker does not retype successfully imported information. Name and Phone Number must exist before saving; if either is unavailable from the source, the broker provides only the missing minimum value. Role remains optional. Technical import mechanism remains deferred.

**J-06 — Match Requirement to Properties (Direction A)**
The system has compared the selected Requirement against the broker's property inventory, produced scores (0–100), explained the score/result using relevant matching reasons, and surfaced all Properties scoring ≥70%. Zero qualifying matches (no Properties reaching 70%) is a valid successful outcome. Matching is broker-initiated, private, per-broker, rule-based, non-AI, non-automatic, non-background, non-marketplace. Scoring formula deferred.

**J-07 — Match Property to Requirements and Clients (Direction B)**
The system has compared the selected Property against the broker's Requirement inventory, produced scores (0–100), explained the score/result using relevant matching reasons, identified the associated Buyer/Tenant Contact for each qualifying Requirement, and surfaced all Requirements scoring ≥70%. Zero qualifying matches is a valid successful outcome. All Matching boundaries from J-06 apply.

**J-08 — Share Property with Contact**
The broker has initiated a private, one-to-one sharing action for a specific Property directed at any specific saved Contact (Tenant, Buyer, Owner, Broker, or Contact with no role) via the broker's chosen WhatsApp or WhatsApp Business application. Sharing payload, Property card design, UX entry point, and technical WhatsApp mechanism remain deferred.

**J-09 — Communicate with Contact**
The broker has initiated communication through their chosen WhatsApp or WhatsApp Business application for a specific Contact, from within a relevant product context. Both WhatsApp and WhatsApp Business must remain supported choices. Technical behavior, exact communication action (chat open, prepared message, contact context), and exact implementation remain deferred. No in-app messaging. No guarantee of direct voice-call launching.

**J-10 — Enrich Contact**
The Contact record has been updated with additional information — which may include role assignment, additional details, and/or a Contact Note — and if a Buyer or Tenant role has been assigned, the Contact is now eligible to own one or more Requirements. Exact complete Contact field schema deferred.

**J-11 — Enrich Property**
The Property record has been updated with additional information, which may include further property details, media attachments (Photos / Videos / Documents), a Property Note, Classification, and/or additional location detail as permitted by later UX/data decisions. Property Note remains separate from Property Description. Exact complete Property schema deferred.

**J-12 — Enrich Requirement**
The Requirement record has been updated with additional matching criteria beyond its minimum captured fields. Enrichment must not become mandatory for initial capture. Exact Requirement schema deferred.

**J-13 — Classify Contact or Property**
A single classification label (Follow Up / Important / Pending / Order Complete or Closed Deal) is applied to a Contact or Property record, is immediately visible during normal record use, and was set through one direct action — without entering a date, creating a task, or setting a reminder. Classification applies only to Contacts and Properties. Exact visual placement deferred to UX stage.

**J-14 — Configure Profile and Language**
The broker's language preference (Arabic or English) is saved and the app renders in the corresponding direction (RTL / LTR). Profile enrichment is optional. No mandatory first-run language-selection gate. No mandatory Profile-completion gate. Default: Arabic — RTL. English is selectable. The broker may change language later through the app's language preference control. Exact UI location of language preference control deferred. Exact Profile field set deferred unless already frozen elsewhere.

**J-15 — Global Search and Retrieve**
The broker has located a specific Contact or Property using a term matching one of the four frozen searchable fields (Contact Name, Phone Number, Property Title, or Location Area) through a quickly accessible Global Search. Search results clearly identify each result as a Contact or Property. Exact placement, presentation, and result grouping method deferred to UX stage.

---

## Minimum BASIC Capture Definitions (Frozen)

| Entity | Minimum Required Fields | Target |
|--------|------------------------|--------|
| Contact | Name · Phone Number | ~10–15 seconds |
| Property | Property Type · Purpose (Sale/Rent) · Price · Market-configured Location Area | ~10–15 seconds |
| Requirement | Property Type · Purpose (Buy/Rent) · Budget Range | ~10–15 seconds |
| Contact Import | Name + Phone Number must exist before save (broker provides only missing minimum value if unavailable from source) | — |

**Capture First → Enrich Later** is mandatory. Optional enrichment may never become a mandatory prerequisite for valid BASIC capture unless a future Founder-approved scope change explicitly changes this rule.

---

## Matching Behavior (Frozen)

| Rule | Value |
|------|-------|
| Direction A | Requirement → Properties |
| Direction B | Property → Requirements / associated Buyer-Tenant Contacts |
| Pattern | Compare → Score (0–100) → Explain |
| Visibility threshold | Results scoring ≥70% only |
| Zero qualifying matches | Valid successful outcome — "No Matches ≥70%" |
| Matching initiation | Broker-initiated only |
| Automation | None |
| Scoring formula | Fully deferred |
| Scoring weights | Deferred |
| Coefficients | Deferred |
| Field importance | Deferred |
| Explanation structure | Deferred — product requires explanation using relevant matching reasons |
| Cross-broker matching | Not in V001 |
| AI / ML | Not in V001 |

**Matching architecture protection:** The future Matching implementation must permit scoring logic to evolve without requiring unnecessary reconstruction of the entire Matching layer. The exact scoring architecture remains deferred. This statement protects future flexibility only.

---

## Import / Export Scope (Frozen)

| Item | Status |
|------|--------|
| Contact Import (WhatsApp / WA Business / Device Contacts) | IN V001 |
| Property Sharing via WhatsApp / WhatsApp Business | IN V001 |
| Property Import | NOT IN V001 |
| Full Export System | DEFERRED |

Property Sharing and Full Export remain separate concepts. Any future request to promote Property Import or Full Export into V001 requires explicit Founder scope-change review of Stage 00.2.x — not a silent Stage 00.3 change.

---

## Global Search Scope (Frozen)

Searchable in V001:
- Contact Name
- Phone Number
- Property Title
- Location Area

NOT searchable: Requirements · Notes · Media
NOT supported: Semantic search · AI search · Saved searches · Advanced query language

Product requirement: Global Search must be quickly accessible throughout the primary app experience. Exact placement and presentation deferred to UX stage. Results must clearly identify each item as Contact or Property.

---

## Classification Scope (Frozen)

Applies to: Contact, Property only
Does NOT apply to: Requirement, Match, Note, Media

Four labels: Follow Up · Important · Pending · Order Complete / Closed Deal
One label at a time per supported record. Classification is optional.
Product requirement: immediately visible during normal record use, changeable through one direct action.
Exact visual placement: DEFERRED to UX stage.
Not allowed: dates, reminders, tasks, calendar, automation, pipeline, deal-management workflow.

---

## Authentication / Profile / Language (Frozen)

- Authentication is required before productive use
- Broker may immediately begin productive use after authentication — no mandatory Profile gate, no mandatory Language gate
- Default language: Arabic — RTL
- English is user-selectable
- Broker may change language later through the app's language preference control
- Profile enrichment is optional and may occur at any time
- Exact UI location of language preference control: deferred
- Auth provider, session lifetime, re-authentication behavior: deferred (DEC-008 PENDING)

---

## Property Sharing Recipient (Frozen)

Property Sharing may target any saved Contact, including:
- Tenant · Buyer · Owner · Broker · Contact with no role assigned

Conditions: private · broker-initiated · one specific Property · one specific Contact · via WhatsApp or WhatsApp Business.
Private one-to-one sharing with a Broker Contact is NOT Marketplace behavior.
Broker-to-Broker Marketplace remains OUT OF V001.

---

## Stale Documentation Register

The following findings from Stage 00.3 analysis are preserved for the consolidated Governance Cleanup Pass before Stage 01. They do not override frozen governance. Files are not modified here.

- Premature OTP authentication assumptions — `docs/ux/README.md`, `docs/database/README.md`
- Premature fixed navigation/tab structure assumptions — `docs/ux/README.md`
- Persistent Matches-tab assumption — `docs/ux/README.md`
- Notifications assumption (not in V001) — `docs/ux/README.md`
- Localization SDK implementation assumptions — `docs/ux/README.md`
- Soft-delete / retention assumptions — `docs/database/README.md`
- WhatsApp raw-file parsing / retention assumptions — `docs/database/README.md`
- Missing Contact Notes / Property Notes from module index — `docs/modules/README.md`
- Incomplete module index — `docs/modules/README.md`
- Premature database/ER structure assumptions — `docs/database/README.md`

---

## What Is NOT Frozen by Stage 00.3

| Topic | Deferred to |
|-------|------------|
| Auth provider (DEC-008 PENDING) | Foundation stage |
| Object storage provider (DEC-009 PENDING) | Media stage |
| Session lifetime and re-authentication behavior | Foundation/Auth stage |
| Matching scoring formula, weights, algorithm | Implementation stage |
| Matching explanation exact structure and fields | Implementation stage |
| Matching scoring architecture | Implementation stage |
| Property location visual selection method (list/map/other) | UX stage |
| Property location taxonomy (Kuwait area names) | Market Configuration stage |
| Classification exact visual placement | UX stage |
| Global Search exact placement and presentation | UX stage |
| Language preference control exact UI location | UX stage |
| WhatsApp / WA Business technical mechanism | Integration stage |
| Property Sharing payload format and card design | Integration / UX stages |
| Property Sharing UX entry point and selection sequence | UX stage |
| Import technical mechanism | Integration stage |
| Contact import validity: completeness beyond Name + Phone | Integration stage |
| Contact complete field schema | Database stage |
| Property complete field schema | Database stage |
| Requirement complete field schema | Database stage |
| Media storage, file types, size limits, codecs | Architecture / Database / Media stages |
| Brand primary blue hex | UI stage |
| Arabic translations (ar.json) | Founder-authored, before UI stage |
| Kuwait area taxonomy (names, groupings, IDs) | Market Configuration stage |
| Database schema, column names, types, constraints | Database stage |
| All V001 deferred capabilities (Full Export, Market Config Admin, Backup/Sync, Commission, Analytics) | Post-V001 or designated stage |

---

## Change Policy for Frozen Stage

This stage is governed by **Change Policy Category A — Governance changes** (highest risk).

**Process for any future change to Stage 00.3 content:**
1. Founder proposes the change in writing with rationale
2. AI shows the exact diff of what would change
3. Founder explicitly confirms
4. AI applies the change
5. A new decision entry is logged in DECISIONS.md with date, reason, and reference to this freeze record

**Prohibited without this process:**
- Any AI session silently editing Stage 00.3 journey definitions during implementation work
- Expanding or narrowing any journey's scope, success definition, or minimum capture definition without a formal change request

---

## Implementation Status at Freeze

**PRE-IMPLEMENTATION — confirmed.**
Zero product feature code has been written or modified. The app scaffold is a blank Expo shell with no product UI. All implementation layers remain locked pending explicit Founder authorization.

---

## Next Stage

**Stage 00.4** has NOT started. It remains **WAITING** and must not begin until the Founder explicitly authorizes it.

The Founder may authorize Stage 00.4 at any time by issuing the explicit authorization command for that stage.
