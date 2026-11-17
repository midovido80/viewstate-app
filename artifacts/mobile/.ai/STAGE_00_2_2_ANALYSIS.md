# Stage 00.2.2 — Minimum Capability Analysis
## CORRECTED FINAL REPORT

**Status:** 🔒 FROZEN / APPROVED
**Date:** 2026-08-13
**Frozen by:** Founder + CTO
**Authorization:** Founder verbal authorization — "نفذ ال correction و ال verification و اقفل المرحة دي"
**Recorded in:** DECISIONS.md DEC-018 · DEC-019 · DEC-020 · DEC-021
**Mode:** Analysis / report only. Zero file modifications to product code.
**Corrections applied:** Two CTO-verified corrections (Property Location visual-method neutralization; Authentication session-lifetime specificity removed) + three Founder decisions (Bidirectional Matching · Multiple Requirements · One Editable Running Note).
**Stage 00.1 status:** 🔒 FROZEN / APPROVED — untouched.
**Stage 00.2.1 status:** 🔒 FROZEN / APPROVED — untouched.
**PRE-IMPLEMENTATION:** Active.

> **Change Policy:** Any future change to this frozen Stage 00.2.2 content requires Change Policy Category A: Founder written approval → exact diff → explicit confirm → applied → new DECISIONS.md entry logged.

---

## SECTION 1 — Corrected Minimum Capability Matrix

| # | Capability | Minimum V001 Capability | Minimum User Outcome | Explicitly NOT Required in V001 | Scope-Creep Boundary | Governance Confidence |
|---|-----------|------------------------|---------------------|--------------------------------|---------------------|----------------------|
| 1 | Properties | Create and manage property listings with bilingual fields; include type, purpose, price, and market-configured location area at minimum | Broker captures a usable property record in ~10–15 seconds | Advanced filters, bulk operations, property history, public listings, print-ready formats | Properties must not become a public portal, marketing platform, or content management system | **CONFIRMED** |
| 2 | Contacts | Create and manage contacts with exactly four roles (Buyer / Tenant / Owner / Broker); name and phone at minimum; multi-role supported | Broker captures a usable contact record in ~10–15 seconds | CRM pipelines, follow-up scheduling, relationship scoring, social profiles | Contacts must not introduce a fifth role or become a sales CRM with pipeline stages | **CONFIRMED** |
| 3 | Buyer / Tenant Requirements | A Buyer or Tenant contact may have one or more Requirements; each captured independently; minimum = property type + budget range; each Requirement is independently enrichable and independently usable for Matching | Broker captures a usable Requirement against a contact in ~10–15 seconds; each Requirement can stand alone | Maximum limit on requirements per contact, active/inactive status, priority ranking, requirement expiration, requirement versioning | Requirements must not become a proposal system, quoted-price tracker, or deal ledger | **CONFIRMED** |
| 4 | Matching | Broker-initiated; bidirectional — Direction A: Requirement → matching Properties; Direction B: Property → matching Requirements / relevant Buyer-Tenant contacts; produces Compare + Score (0–100) + Explain per match | Broker finds matches they would otherwise have missed; understands exactly why each match scored as it did | Automatic match alerts, push notifications, cross-broker matching, ML, AI recommendations, saved search subscriptions | Matching must not become automated, cross-broker, or AI-driven | **CONFIRMED** |
| 5 | Classification | Optional 4-label status tag on contacts and properties; exactly: Follow Up / Important / Pending / Order Complete or Closed Deal; one label at a time per record; visible beside entity name | Broker marks a contact or property with a status label without entering a task or date | Dates, reminders, automation, pipeline stages, calendar integration, deal ledger | Classification must not become a task engine, reminder system, or deal management tool | **CONFIRMED** |
| 6 | Global Search | Available from every primary screen; searches contact names, phone numbers, property titles, and location areas; results grouped by entity type | Broker finds any contact or property from any primary screen in a single tap | Boolean operators, saved searches, cross-entity relational queries, AI-interpreted queries | Search must remain a simple text match across the four defined fields; must not become a query language | **CONFIRMED** |
| 7 | WhatsApp / WhatsApp Business Communication Choice | When broker initiates a communication action, both WhatsApp and WhatsApp Business are presented as required choices; selected app opens | Broker contacts a client via their preferred WhatsApp account without leaving ViewState's workflow | In-app messaging, automated outreach, WhatsApp Business API for automation, locked-to-one-app | Both apps must remain available choices; technical mechanism deferred to Integration stage | **CONFIRMED** |
| 8 | Import | WhatsApp-driven and WhatsApp Business-driven capture/import flows; device contacts import; contact-level capture only | Broker imports a contact or lead captured via WhatsApp or from device contacts without manual re-entry | Property import, bulk CSV import, third-party CRM import, import history, import conflict resolution UI | Import is contact/lead capture only; no property import; technical mechanism deferred to Integration stage | **CONFIRMED** |
| 9 | Property Sharing via WhatsApp / WhatsApp Business | Broker privately shares a relevant Property with a specific client using either WhatsApp or WhatsApp Business; both required as choices; private and broker-initiated | Broker shares a property with a specific client in a private, direct action using their preferred WhatsApp account | Public property publishing, broker-to-broker exchange, bulk sharing, scheduled sharing, shared links without recipient context | Sharing is strictly one-to-one, private, broker-initiated; not a public portal or marketplace; UX selection order not defined here | **CONFIRMED** |
| 10 | User Profile | Broker profile record; language preference (Arabic / English) controlling app-wide RTL/LTR; basic preferences; Basic Settings is a sub-capability within this module | Broker switches language and the app renders fully in RTL or LTR accordingly | Account management for other users, admin dashboards, team management, advanced notification preferences | Basic Settings is not a standalone product module; no standalone Settings screen | **CONFIRMED** |
| 11 | Authentication / Login | Broker can create an account / Broker can log in / Authenticated session (lifetime and re-authentication behavior deferred to Foundation/Auth stage and DEC-008) / All data is isolated per broker — no cross-broker access | Broker authenticates and accesses their private data in isolation from all other brokers | Biometric-only login lock, social login, multi-user shared account, guest mode with data | Auth must not allow cross-broker data access; technical mechanism, session lifetime, and re-authentication behavior deferred to Foundation/Auth stage | **CONFIRMED** |
| 12 | Media & Attachments | Broker attaches Photos, Videos, or Documents to property records; all three types required at product scope | Broker attaches evidence or documentation to a property record | Contact media, requirement media, in-app media editing, media processing, CDN configuration, document workflow system | Media is attachment-level only — property records only; must not become a content management platform | **CONFIRMED** |
| 13 | Contact Notes | One editable running internal note per Contact; plain-text; the broker can read and update it | Broker records and updates a plain-text private note about a contact | Multiple timestamped note entries, note history, append-only log, rich text, embedded media, team-visible notes | Notes are private broker annotations; must not become tasks, reminders, or threaded communication | **CONFIRMED** |
| 14 | Property Notes | One editable running internal note per Property; plain-text; distinct from Property Description; the broker can read and update it | Broker records and updates a plain-text private annotation about a property, separate from its public-facing description | Multiple timestamped note entries, note history, append-only log, rich text, embedded media, task creation from notes | Property Notes ≠ Property Description; Notes are private broker annotations; must not become task or deal management | **CONFIRMED** |
| 15 | Property Location | Market-configurable location field within Properties and Requirements; broker selects from a pre-loaded, market-configured location source; Kuwait area list is the first concrete market configuration | Broker associates a property or requirement with a location area from the market-configured source | Broker-facing free-text location entry, location taxonomy administration UI; visual selection method, map interaction, and coordinate usage are deferred to UX / Market Configuration / Database stages | Location structure, hierarchy, and visual selection method are deferred to UX / Market Configuration / Database stages; V001 establishes only that the broker selects from a pre-loaded, market-configured source | **CONFIRMED** |

---

## SECTION 2 — Minimum V001 Capability Definition — Per Capability

---

### Capability 1 — Properties

**Core Purpose:** The supply-side entity of the matching engine. The broker's property inventory.

**Minimum V001 Capability:**
- Broker can create a property record with at minimum: type, purpose, price, and a market-configured location area
- Broker can view, edit, and list properties
- Broker can associate media (Photos, Videos, Documents) with a property record
- Property records support bilingual fields (Arabic / English)

**Minimum Successful User Outcome:** A broker captures a usable property record in approximately 10–15 seconds that can participate in Matching and be shared with a client.

**Not Required for V001:** Advanced filtering, bulk operations, property valuation history, print-ready property cards, public listing pages, automated status updates.

**Scope Boundary:** Properties must not become a public portal, consumer search platform, or content management system. Property Description is the public-facing field; Property Notes are the broker's private annotations — these are distinct.

---

### Capability 2 — Contacts

**Core Purpose:** The relationship entity. Every buyer, tenant, owner, and broker the V001 broker interacts with.

**Minimum V001 Capability:**
- Broker can create a contact with at minimum: name and phone number
- Exactly four roles supported: Buyer, Tenant, Owner, Broker — no others
- A contact may hold more than one role simultaneously
- Broker can view, edit, and list contacts

**Minimum Successful User Outcome:** A broker captures a usable contact record in approximately 10–15 seconds. The contact is immediately retrievable and linkable to Requirements.

**Not Required for V001:** Relationship scoring, pipeline stages, follow-up scheduling with dates, social profile enrichment, contact deduplication UI.

**Scope Boundary:** Contacts must not introduce a fifth role or evolve into a sales CRM with pipeline management or calendar-driven follow-up.

---

### Capability 3 — Buyer / Tenant Requirements

**Core Purpose:** The demand-side entity of the matching engine. What a Buyer or Tenant contact is looking for.

**Minimum V001 Capability:**
- A Buyer or Tenant contact may have one or more Requirements — no artificial limit
- Each Requirement is captured independently: minimum = property type + budget range
- Each Requirement is independently enrichable after initial capture
- Each Requirement independently participates in Matching

**Minimum Successful User Outcome:** A broker captures a usable Requirement linked to a contact in approximately 10–15 seconds. If the same client has two distinct property needs, both are capturable as separate Requirements. Each can be matched independently against the broker's property inventory.

**Not Required for V001:** Active/inactive requirement status, maximum requirement count, requirement priority ranking, requirement expiration logic, requirement version history.

**Scope Boundary:** Requirements must not become a proposal system, quoted-price ledger, or deal stage. Capture First → Enrich Later applies: a Requirement with only property type and budget is complete and valid.

---

### Capability 4 — Matching

**Core Purpose:** The North Star Act-phase outcome. The broker discovers matches they would otherwise have missed.

**Minimum V001 Capability:**
- Matching is bidirectional:
  - **Direction A — Requirement → Properties:** Broker starts from a Buyer/Tenant Requirement and identifies matching Properties from their own inventory
  - **Direction B — Property → Requirements / Relevant Clients:** Broker starts from a Property and identifies matching Buyer/Tenant Requirements (and associated contacts) from their own data
- Both directions produce: Compare (field-by-field) + Score (0–100) + Explain (which fields matched and which did not)
- Matching is broker-initiated, rule-based, per-broker, and private
- No cross-broker matching; no ML; no automated alerts

**Minimum Successful User Outcome:** The broker can discover a match starting from either direction. A property inquiry prompts the broker to check which of their Buyer/Tenant Requirements it fits; a new Requirement prompts the broker to check which of their properties it matches.

**Not Required for V001:** Automatic match notifications, push alerts for new matches, ML or AI scoring, saved match subscriptions, cross-broker matching, semantic or vector-based matching, scoring weights configuration.

**Scope Boundary:** Matching must remain on-demand, broker-initiated only. Neither direction triggers automatic notifications. Matching score remains 0–100 rule-based — no thresholds, weights, or algorithm implementation is defined at this stage.

---

### Capability 5 — Classification

**Core Purpose:** Lightweight optional status tagging to support the Organize phase and basic Act-phase prioritization.

**Minimum V001 Capability:**
- Broker can apply one of exactly four labels to a Contact or Property: Follow Up / Important / Pending / Order Complete or Closed Deal
- Only one label at a time per record
- Label is visible beside the entity name in list views
- Classification is optional — broker applies it only when needed

**Minimum Successful User Outcome:** A broker can immediately mark a contact or property with a status label with a single action, without entering a date or creating a task.

**Not Required for V001:** Dates, reminders, automation, pipeline stages, deal value tracking, commission records, calendar integration.

**Scope Boundary:** Classification must not evolve into a task engine, reminder system, deal ledger, or pipeline. "Order Complete / Closed Deal" is a status label only — not a transaction tracker.

---

### Capability 6 — Global Search

**Core Purpose:** Core utility enabling the broker to retrieve any entity from any primary screen without navigating into module lists first.

**Minimum V001 Capability:**
- Available from every primary screen via the blue top header
- Searches across: contact names, phone numbers, property titles, and location areas
- Results grouped by entity type: Properties / Contacts
- Single tap activates search

**Minimum Successful User Outcome:** A broker locates any contact or property from any primary screen in a single tap and a few keystrokes.

**Not Required for V001:** Boolean operators, saved searches, AI-interpreted queries, cross-entity relational filtering, search history.

**Scope Boundary:** Search must remain a simple text match across the four defined fields. Must not become a query language or a reporting feature.

---

### Capability 7 — WhatsApp / WhatsApp Business Communication Choice

**Core Purpose:** Required Act-phase communication channel. Brokers work primarily through WhatsApp and WhatsApp Business — ViewState must surface both without forcing the broker to leave the workflow to switch apps manually.

**Minimum V001 Capability:**
- When a communication action is initiated from a contact or property workflow, both WhatsApp and WhatsApp Business are presented as required choices
- Broker selects one; the selected app opens
- Both options are equally required

**Minimum Successful User Outcome:** A broker initiates a call or message to a contact using their preferred WhatsApp account without manually switching apps.

**Not Required for V001:** In-app messaging, automated WhatsApp Business outreach, WhatsApp Business API for automated message sending, message history inside ViewState.

**Scope Boundary:** Both apps must remain available choices at all times. Technical mechanism (deep links, intents, APIs) deferred to Integration stage. V001 does not include in-app messaging or automated outreach.

---

### Capability 8 — Import

**Core Purpose:** Key Capture-phase input. Allows the broker to bring contacts and leads into ViewState from WhatsApp, WhatsApp Business, or the device contacts list without manual re-entry.

**Minimum V001 Capability:**
- Import from WhatsApp-driven flows (contact/lead capture)
- Import from WhatsApp Business-driven flows (contact/lead capture)
- Import from device contacts list
- All import flows produce Contact records

**Minimum Successful User Outcome:** A broker transfers a contact or lead from WhatsApp or their device contacts into ViewState without typing all fields manually.

**Not Required for V001:** Property import, bulk CSV import, third-party CRM integration, import history log, duplicate detection and merge UI.

**Scope Boundary:** Import is contact-level capture only. No property import in V001. Technical mechanism deferred to Integration stage.

---

### Capability 9 — Property Sharing via WhatsApp / WhatsApp Business

**Core Purpose:** Core Act-phase broker workflow. Enables the broker to privately share a property with a specific client using their established WhatsApp communication channel.

**Minimum V001 Capability:**
- Broker can privately share a relevant Property with a specific client using either WhatsApp or WhatsApp Business
- Both WhatsApp and WhatsApp Business are required choices
- The sharing action is private, broker-initiated, and directed at a specific client
- The UX entry point and selection order are not defined at this stage

**Minimum Successful User Outcome:** A broker shares a property with a specific client via their preferred WhatsApp account in a direct, private action. The UX stage will determine whether the flow starts from the property, the contact, a matching result, or another approved context.

**Not Required for V001:** Public property publishing, broker-to-broker property sharing, bulk sharing, scheduled sharing, branded property card design (deferred to UX / Integration stages).

**Scope Boundary:** Property Sharing is strictly one-to-one, private, and broker-initiated. It must not become a public portal, marketplace, or publishing platform. Payload format, property card design, and sharing mechanism deferred to Integration / UX stages. UX selection order deferred to UX stage.

---

### Capability 10 — User Profile

**Core Purpose:** Broker identity record and language/locale preference controller for the app.

**Minimum V001 Capability:**
- Broker can view and update their profile (name, contact details, basic preferences)
- Language preference (Arabic / English) controls app-wide RTL / LTR rendering
- Basic Settings is a sub-capability within User Profile — not a standalone product module or screen

**Minimum Successful User Outcome:** A broker switches the app language and it renders correctly in RTL or LTR throughout.

**Not Required for V001:** Team account management, role-based access control, multi-user profiles, admin dashboards, advanced notification settings.

**Scope Boundary:** Basic Settings is contained within User Profile. No standalone Settings screen. Language/locale is the only global app behavior setting in V001.

---

### Capability 11 — Authentication / Login

**Core Purpose:** Foundational prerequisite enabling per-broker data isolation. No ViewState feature functions without it.

**Minimum V001 Capability:**
- Broker can create an account
- Broker can log in
- Authenticated session — specific session lifetime and re-authentication behavior are deferred to the Foundation/Auth stage and auth-provider decision (DEC-008 PENDING)
- All data is isolated per broker — no cross-broker access

**Minimum Successful User Outcome:** A broker registers, logs in, and accesses only their own contacts, properties, requirements, and matches, with no access to any other broker's data.

**Not Required for V001:** Social login, multi-user shared account, guest/demo mode, admin account management UI.

**Scope Boundary:** Auth provider (Clerk / Replit Auth / Custom OTP — DEC-008 PENDING) remains a deferred Founder decision. Per-broker data isolation is the non-negotiable product behavior. Session lifetime, re-authentication frequency, and app-restart behavior are all Foundation/Auth stage decisions dependent on the chosen auth provider.

---

### Capability 12 — Media & Attachments

**Core Purpose:** Allows the broker to attach supporting evidence and documentation to property records.

**Minimum V001 Capability:**
- Broker can attach Photos, Videos, and Documents to a property record
- All three media types are required at product scope
- Media is attached at property-record level only

**Minimum Successful User Outcome:** A broker attaches one or more photos, a video walkthrough, or a document to a property record without leaving ViewState.

**Not Required for V001:** Contact media attachments, requirement media attachments, in-app media editing, video compression configuration, document templates, branded media export, media CDN administration.

**Scope Boundary:** Media is attachment-level only — property records only. Must not become a content management platform, digital asset library, or media processing tool. Storage provider, file size limits, supported codecs and extensions, and upload mechanism are all deferred to Architecture / Database / Media stages.

---

### Capability 13 — Contact Notes

**Core Purpose:** Private broker annotation layer on Contact records, supporting the Enrich Later phase of Capture First → Enrich Later.

**Minimum V001 Capability:**
- Each Contact has one editable running internal note
- The note is plain-text at product scope
- The broker can read and update the note at any time

**Minimum Successful User Outcome:** A broker records a private note about a contact and can update it during subsequent interactions with that contact.

**Not Required for V001:** Multiple note entries per contact, timestamped note history, append-only log, note threading, team-visible notes, rich text formatting, embedded media within notes.

**Scope Boundary:** Contact Notes are private broker annotations. They must not evolve into tasks, reminders, deal tracking, or team communication. Note persistence (column name, data type, storage structure) deferred to Database stage. The V001 product behavior — one editable running note per Contact — does not prevent future versions from expanding to multiple notes or a timeline model.

---

### Capability 14 — Property Notes

**Core Purpose:** Private broker annotation layer on Property records. Conceptually and technically distinct from Property Description.

**Minimum V001 Capability:**
- Each Property has one editable running internal note
- The note is plain-text at product scope
- The broker can read and update the note at any time
- Property Notes are separate from Property Description — Description describes the property to clients; Notes are the broker's private annotations

**Minimum Successful User Outcome:** A broker records a private annotation about a property (e.g., access instructions, internal commentary) and can update it, completely separately from the property's client-facing description.

**Not Required for V001:** Multiple note entries per property, timestamped note history, append-only log, note threading, rich text, embedded media within notes, task creation from notes.

**Scope Boundary:** Property Notes are private broker annotations. They must not evolve into task management, deal stage tracking, commission records, or threaded communication. Note persistence deferred to Database stage. The V001 product behavior — one editable running note per Property — does not prevent future versions from expanding.

---

### Capability 15 — Property Location

**Core Purpose:** Market-configurable location field within Properties and Requirements, enabling filtering and matching by location area.

**Minimum V001 Capability:**
- Broker selects a location area from a pre-loaded, market-configured location source when creating or editing a property or requirement
- Kuwait area list is the first concrete market configuration for V001
- V001 product behavior is selection from a pre-loaded, market-configured location source; the visual selection method, map interaction model, coordinate usage, and taxonomy presentation are deferred to UX / Market Configuration / Database stages

**Minimum Successful User Outcome:** A broker associates a property or requirement with a Kuwait area from the pre-loaded market-configured source, enabling location-based filtering and matching.

**Not Required for V001:** Broker-facing free-text location text entry, location taxonomy administration UI; visual selection method (list, map, or other), map interaction, and coordinate usage are not defined at Stage 00.2.2 and are deferred to UX / Market Configuration / Database stages.

**Scope Boundary:** The structure and hierarchy of the market-configured location source (flat, hierarchical, governorate-based, district-based, or other) is not defined at this stage — it is a Market Configuration / Database stage decision. The visual selection method is not defined at this stage — it is a UX stage decision. V001 establishes only that: the broker selects from a pre-loaded, market-configured source. No location administration UI in V001.

---

## SECTION 3 — Founder Decision Resolution Status

### Matching Direction
**RESOLVED BY FOUNDER — DEC-018**

V001 Matching is bidirectional.

Direction A: Requirement → matching Properties — broker starts from a Buyer/Tenant Requirement and identifies matching Properties from their own inventory.

Direction B: Property → matching Requirements / Relevant Clients — broker starts from a Property and identifies matching Buyer/Tenant Requirements and associated contacts from their own data.

Both directions produce: Compare + Score (0–100) + Explain. Matching remains broker-initiated, rule-based, per-broker, private, and non-AI. No scoring weights, thresholds, algorithm, schema, or implementation detail is defined by this decision.

---

### Requirements Cardinality
**RESOLVED BY FOUNDER — DEC-019**

A Buyer/Tenant contact may have one or more Requirements. V001 must not artificially restrict a Buyer/Tenant to a single Requirement.

Each Requirement is independently capturable, independently enrichable, and independently usable in Matching. No active/inactive status, no maximum count, no priority ranking, no lifecycle rules, no requirement grouping are defined by this decision.

Capture First → Enrich Later remains intact: a Requirement with only property type and budget range is a valid, complete record regardless of how many other Requirements the same contact holds.

---

### Notes Cardinality
**RESOLVED BY FOUNDER — DEC-020**

Contact Notes: one editable running internal note per Contact in V001. The broker can read and update it.

Property Notes: one editable running internal note per Property in V001. The broker can read and update it. Property Notes remain distinct from Property Description.

No database column, data type, storage structure, timestamps, versioning mechanism, audit log, or note history persistence is defined by this decision — it is product behavior only. Future versions may expand Notes into multiple entries, a timeline, or an activity log.

---

## SECTION 4 — Capture First Compliance

**Properties:** ✅ COMPLIANT — type + purpose + price + location area is the minimum. All other fields are optional on first capture. 10–15 second target is preserved.

**Contacts:** ✅ COMPLIANT — name + phone is the minimum. Role may be assigned immediately or later. Multi-role support does not affect the capture floor. 10–15 second target is preserved.

**Requirements:** ✅ COMPLIANT — property type + budget range is the minimum for each Requirement. The fact that a contact may have multiple Requirements does not make basic Contact capture heavier. A Contact is captured independently as a standalone record. Requirements are added as a separate demand-record workflow, after the Contact exists. A broker who captures a contact with name and phone and then separately adds one or more Requirements is following Capture First → Enrich Later correctly. The multiple-Requirements capability adds no mandatory fields to the Contact capture flow. 10–15 second target per Requirement is preserved.

**Import:** ✅ COMPLIANT — Import produces Contact records. No fields are required beyond what arrives from the import source. Imported contacts are valid, complete records. Capture First is structurally honored by the import flow.

**Assessment:** Multiple Requirements per Buyer/Tenant contact do not increase the burden of basic Contact capture. They are additive, separate-workflow records. Capture First → Enrich Later is fully intact across all four entities.

---

## SECTION 5 — Capture → Organize → Act Coverage

| Phase | Capabilities Covering This Phase | Status |
|-------|----------------------------------|--------|
| **Capture** | Properties · Contacts · Buyer/Tenant Requirements · Import · Media & Attachments | ✅ Fully covered — multiple entry paths for all three primary entity types |
| **Organize** | Classification · Global Search · Contact Notes · Property Notes · Property Location · User Profile (language/RTL) | ✅ Fully covered — broker can classify, search, annotate, and organize all captured data |
| **Act** | Matching (bidirectional) · WhatsApp/WA Business Communication Choice · Property Sharing via WhatsApp/WA Business | ✅ Fully covered — broker can discover matches in both directions, communicate, and share |

**Assessment:** All three phases remain comprehensively covered. Bidirectional Matching strengthens the Act phase without expanding scope. Multiple Requirements per contact strengthens Matching input depth without adding Capture friction.

---

## SECTION 6 — North Star Coverage

The North Star outcome is: **the broker finds a match they would otherwise have missed.**

Bidirectional Matching advances this directly and meaningfully:

- **Direction A (Requirement → Properties):** A broker receives a new buyer/tenant requirement and can immediately surface matching properties from their own inventory. Classic demand-led discovery.
- **Direction B (Property → Requirements / Clients):** A broker receives a new property listing and can immediately surface which of their existing Buyer/Tenant Requirements it matches. Inventory-led discovery — a qualitatively different and equally valuable broker workflow.

Both directions use the same frozen Compare + Score + Explain mechanism. Neither introduces automation, AI, cross-broker access, or marketplace behavior. The expansion is product behavior scope only — not mechanism expansion.

Multiple Requirements per contact further strengthens North Star coverage: a buyer with two distinct simultaneous needs can now have both entered and both matched independently. The broker misses fewer matches.

**Assessment:** Bidirectional Matching improves North Star coverage substantially. No automation, AI, or marketplace behavior is introduced. All existing matching scope rules remain intact.

---

## SECTION 7 — Duplication / Overlap Check

| Pair | Relationship | Verdict |
|------|-------------|---------|
| **Classification vs. Follow-up** | Classification is the optional 4-label status tag (one at a time per record). There is no separate "follow-up" product module. "Follow Up" is one of the four labels — it is fully contained within Classification. | ✅ No overlap — confirmed clean |
| **User Profile vs. Basic Settings** | Basic Settings (language/locale preference) is a sub-capability within User Profile — not a standalone product module or separate screen. | ✅ No overlap — confirmed clean |
| **WhatsApp Communication vs. Property Sharing** | WhatsApp / WA Business Communication Choice = general broker-to-contact communication (calls, messages). Property Sharing = specific Act-phase workflow of sharing a property record with a specific client. The communication choice applies broadly; sharing is property-specific. They share the same two-app choice mechanic but serve distinct product purposes. | ✅ Distinct — confirmed clean; no merger |
| **Property Location vs. Market Configuration** | Property Location is a product capability (broker selects a location area from a pre-loaded source). Market Configuration Administration is DEFERRED — the broker does not administer the taxonomy in V001. The broker consumes the configured data; they do not manage it. | ✅ Distinct — confirmed clean |
| **Contact Notes vs. Property Notes** | Contact Notes are private annotations on Contact records. Property Notes are private annotations on Property records, distinct from Property Description. Different entities; same structural pattern (one editable running note per record). No overlap between them or with Property Description. | ✅ Distinct — confirmed clean |
| **Import vs. Media & Attachments** | Import produces Contact records from WhatsApp or device contacts. Media & Attachments is the capability for attaching Photos, Videos, and Documents to property records. Different entity targets, different workflows, no functional overlap. | ✅ Distinct — confirmed clean |

---

## SECTION 8 — Scope-Creep Risks

### Risk 1 — Matching → Automated Notifications / AI Scoring
**Level:** HIGH
**Updated boundary:** Matching is now bidirectional. Both directions remain on-demand and broker-initiated. No direction triggers an automatic notification, push alert, or background scan. No ML, no embeddings, no cross-broker matching. The bidirectionality is a product workflow expansion only — the mechanism remains Compare + Score + Explain, rule-based, synchronous, broker-initiated.

### Risk 2 — Requirements → Lifecycle / Status System
**Level:** HIGH
**Updated boundary:** Multiple Requirements per contact are now supported. This must not expand into: active/inactive status flags, priority ordering, requirement expiration logic, requirement version history, or a requirement pipeline. Each Requirement is captured, enriched, and matched independently. No lifecycle management.

### Risk 3 — Classification → Task / Reminder System
**Level:** HIGH
**Boundary unchanged:** Exactly four labels. One at a time per record. No dates, reminders, automation, or pipeline stages. Any date field, "due soon" indicator, or reminder trigger crosses this boundary and requires a formal scope change.

### Risk 4 — Contact Notes / Property Notes → Activity Log / Task System
**Level:** HIGH
**Updated boundary:** Notes cardinality is now explicitly one editable running note per record. This must not expand in V001 into: multiple note entries, an append-only log, a timestamped activity timeline, team-visible notes, rich text with formatting, embedded media, or task creation from notes. One editable running note per record is the complete V001 Notes product behavior.

### Risk 5 — Property Sharing → Marketplace / Public Portal
**Level:** HIGH
**Boundary unchanged:** Property Sharing is private, one-to-one, and broker-initiated to a specific client. UX selection order is not locked — that is a UX stage decision. The product boundary (private, specific client, WhatsApp or WA Business) is locked.

### Risk 6 — Media & Attachments → Content Management Platform
**Level:** HIGH
**Boundary unchanged:** Photos + Videos + Documents attached to property records. Not a general content management system, digital asset library, document workflow platform, or public media CDN.

### Risk 7 — Property Location → Premature Visual / Structural Lock
**Level:** MEDIUM
**Updated boundary:** Property Location uses a pre-loaded, market-configured location source. The hierarchy, structure, and taxonomy of that source are deferred to Market Configuration stage. The visual selection method (list UI, map-based picker, or other) is deferred to the UX stage. No "flat list" assumption. No location administration UI in V001.

### Risk 8 — Global Search → Complex Query Engine
**Level:** MEDIUM
**Boundary unchanged:** Simple text match across contact names, phone numbers, property titles, and location areas. No saved searches, Boolean operators, relational cross-entity query language, or AI-interpreted queries.

### Risk 9 — Matching → Bidirectional + Automated Alerts (combined risk)
**Level:** HIGH
**New entry:** The addition of Direction B (Property → Requirements) must not be interpreted as requiring automatic alerts when a new property is added. The broker explicitly initiates both directions. Neither direction is a background subscription or push notification trigger.

---

## SECTION 9 — Governance Gaps / Ambiguities

`No product-level ambiguities found that block Stage 00.2.2.`

All three Founder decisions have been applied. The two CTO-verified defects have been corrected (location visual-method neutralized; session-lifetime specificity removed). Remaining open items — auth provider (DEC-008), object storage provider (DEC-009), brand primary blue hex, Arabic translations, Kuwait area taxonomy, Kuwait visual selection UX method, GCC expansion configurations — are all implementation, UX, and market configuration details that belong to their respective stages and do not block Stage 00.2.2.

---

## SECTION 10 — Founder Decisions Required

`No unresolved Founder decisions required for Stage 00.2.2.`

All three product-level Founder decisions identified during CTO verification have been resolved (DEC-018, DEC-019, DEC-020). No additional genuine product-level blockers have been identified.

---

## SECTION 11 — Proposed Stage 00.2.2 Minimum Capability Lock

*Frozen as the authoritative Stage 00.2.2 minimum capability definition per Founder + CTO approval.*

1. **Authentication / Login** — Broker account creation, login, and authenticated session. Per-broker data isolation is the non-negotiable product behavior. Session lifetime, re-authentication behavior, and auth provider TBD (DEC-008).

2. **Contacts** — Name and phone minimum; exactly four roles (Buyer / Tenant / Owner / Broker); multi-role supported; role may be assigned at capture or later. 10–15 second capture target.

3. **Properties** — Type, purpose, price, and market-configured location area minimum; bilingual fields; media attachment supported. 10–15 second basic capture target.

4. **Buyer / Tenant Requirements** — A Buyer or Tenant contact may have one or more Requirements; each captured independently with property type and budget range as minimum; each Requirement is independently enrichable and independently usable in Matching. 10–15 second basic capture target per Requirement.

5. **Matching** — Bidirectional, broker-initiated, rule-based, per-broker, and private. Direction A: Requirement → matching Properties. Direction B: Property → matching Requirements / relevant Buyer-Tenant contacts. Both directions produce Compare + Score (0–100) + Explain. No automated alerts, no ML, no cross-broker matching.

6. **Classification** — Optional 4-label status tag on Contacts and Properties; exactly: Follow Up / Important / Pending / Order Complete or Closed Deal; one label at a time per record; visible beside entity name; no dates, reminders, or automation.

7. **Global Search** — Available from every primary screen; searches contact names, phone numbers, property titles, and location areas; results grouped by entity type.

8. **WhatsApp / WhatsApp Business Communication Choice** — Both required communication choices; selected app opens; technical mechanism deferred to Integration stage.

9. **Property Sharing via WhatsApp / WhatsApp Business** — Broker privately shares a relevant Property with a specific client using either WhatsApp or WhatsApp Business; private, broker-initiated, one-to-one; UX selection order and entry point deferred to UX stage; mechanism and payload deferred to Integration stage.

10. **Import** — WhatsApp-driven, WhatsApp Business-driven, and device contacts import producing Contact records; technical mechanism deferred to Integration stage.

11. **User Profile** — Broker profile and language preference (Arabic / English) controlling app-wide RTL / LTR; Basic Settings is a sub-capability within this module, not a standalone screen.

12. **Media & Attachments** — Photos, Videos, and Documents attachable to property records; all three types required at product scope; storage, format, and architecture details deferred to later stages.

13. **Contact Notes** — One editable running internal note per Contact; plain-text; broker can read and update; persistence deferred to Database stage.

14. **Property Notes** — One editable running internal note per Property; plain-text; distinct from Property Description; broker can read and update; persistence deferred to Database stage.

15. **Property Location** — Market-configurable location field within Properties and Requirements; broker selects from a pre-loaded, market-configured location source; Kuwait area list is the first concrete market configuration; location structure, hierarchy, and visual selection method deferred to UX / Market Configuration / Database stages.

---

## Freeze Verification Checklist

| Check | Status |
|-------|--------|
| All three Founder decisions applied exactly | ✅ |
| Matching = bidirectional (Direction A + Direction B) | ✅ |
| Matching = broker-initiated, rule-based, per-broker, non-AI | ✅ |
| Requirements = one or more per Buyer/Tenant contact | ✅ |
| Requirements = no lifecycle/status/priority/cardinality assumptions | ✅ |
| Contact Notes = one editable running note per Contact | ✅ |
| Property Notes = one editable running note per Property | ✅ |
| Property Notes ≠ Property Description | ✅ |
| Notes persistence deferred | ✅ |
| No "flat list" assumption in Property Location | ✅ |
| No map-based selection categorically excluded | ✅ — deferred to UX stage |
| No GPS/coordinate input categorically excluded | ✅ — deferred to UX/Database stages |
| No Property Sharing UX step order locked | ✅ |
| Session lifetime specificity removed from Authentication | ✅ — deferred to Foundation/Auth stage |
| Per-broker data isolation preserved | ✅ |
| Exactly 15 IN V001 capabilities | ✅ |
| No new V001 top-level capability added | ✅ |
| No DEFERRED capability pulled into V001 | ✅ |
| No OUT OF V001 capability pulled into V001 | ✅ |
| Capture First remains intact | ✅ |
| 10–15 second basic capture target remains intact | ✅ |
| Capture → Organize → Act remains intact | ✅ |
| No DB decision introduced | ✅ |
| No UX flow introduced | ✅ |
| No Architecture mechanism selected | ✅ |
| No Integration mechanism selected | ✅ |
| No governance file other than this analysis frozen prematurely | ✅ |
| No product code modified | ✅ |
| Stage 00.2.3 not started | ✅ |
| Stage 00.1 untouched and FROZEN | ✅ |
| Stage 00.2.1 untouched and FROZEN | ✅ |
| PRE-IMPLEMENTATION active | ✅ |

---

`STATUS: 🔒 FROZEN / APPROVED — Stage 00.2.2`
