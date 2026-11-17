# Stage 00.4 — V001 Success & Acceptance Lock
## FORMAL FREEZE RECORD

---

**Stage:** 00.4 — V001 Success & Acceptance Lock
**Status:** 🔒 FROZEN / APPROVED
**Frozen by:** Founder + CTO
**Freeze date:** 2026-08-13
**Authorization:** Founder analysis approval + CTO precision correction passes (C1–C6, four wording fixes, search precision) + Founder freeze authorization
**Recorded in:** DECISIONS.md DEC-027 · DEC-028 · DEC-029
**Analysis documents:** Stage 00.4 Analysis · Precision Correction Pass (C1–C6) · Final Wording Precision (4 fixes)

---

## Freeze Declaration

Stage 00.4 — V001 Success & Acceptance Lock is hereby **FROZEN and APPROVED**.

The product success definition, acceptance criteria for all 15 frozen journeys, cross-product acceptance criteria, 35 release-blocking conditions, and three success levels documented in this stage are the authoritative, locked definition of what constitutes a complete and acceptable ViewState V001 product. No implementation session, AI agent, or collaborator may silently alter the substance of any Stage 00.4 decision.

Any future modification to Stage 00.4 content requires an **explicit governed change request** under the Change Policy (Category A — Governance changes): Founder written approval → exact diff shown → Founder confirms → applied → new DECISIONS.md entry logged.

---

## V001 Product Success Definition

V001 is considered functionally successful when all five of the following statements are demonstrably true:

1. **Capture:** A broker can create a valid Contact (Name + Phone), Property (Type + Purpose + Price + Location Area), or Requirement (Type + Purpose + Budget Range) in a single fast action without being required to provide any optional enrichment — and the saved record is immediately usable across all relevant product actions.

2. **Matching:** A broker can initiate Matching in both directions — Requirement→Properties (A) and Property→Requirements/Clients (B) — receive a scored list (0–100) of all records at ≥70%, see an explanation of each qualifying result using relevant matching reasons, and correctly receive "No Matches ≥70%" when no record qualifies. Neither direction may be absent.

3. **Act:** A broker can locate any Contact or Property through a quickly accessible Global Search across four approved fields, share a specific Property with any saved Contact privately via WhatsApp or WhatsApp Business, and initiate communication with any Contact through WhatsApp or WhatsApp Business.

4. **Privacy:** Every broker's Contacts, Properties, Requirements, Notes, and Matching results are completely invisible to every other broker. No cross-broker data leakage is observable at the product level.

5. **Language & Access:** The product renders in Arabic (RTL) by default. English (LTR) is selectable. A broker enters full productive use immediately after authentication — no mandatory Profile gate, no mandatory Language gate.

---

## Journey Acceptance Matrix

| J# | Journey | Classification | Acceptance Confidence | Blocking Ambiguity? |
|----|---------|---------------|----------------------|--------------------|
| J-01 | Authenticate | CORE | CONFIRMED | No |
| J-02 | Create Contact | CORE | CONFIRMED | No |
| J-03 | Create Property | CORE | CONFIRMED | No |
| J-04 | Create Requirement | CORE | CONFIRMED | No |
| J-05 | Import Contact | CORE | CONFIRMED | No |
| J-06 | Requirement → Properties Matching | CORE | CONFIRMED | No |
| J-07 | Property → Requirements / Clients Matching | CORE | CONFIRMED | No |
| J-08 | Share Property with Contact | CORE | CONFIRMED | No |
| J-09 | Communicate with Contact | SUPPORTING | PARTIALLY DEFINED | No — deferred items are explicitly later-stage decisions |
| J-10 | Enrich Contact | SUPPORTING | CONFIRMED | No |
| J-11 | Enrich Property | SUPPORTING | CONFIRMED | No |
| J-12 | Enrich Requirement | SUPPORTING | CONFIRMED | No |
| J-13 | Classify Contact or Property | SUPPORTING | CONFIRMED | No |
| J-14 | Configure Profile and Language | SUPPORTING | CONFIRMED | No |
| J-15 | Global Search and Retrieve | SUPPORTING | CONFIRMED | No |

**J-09 note:** PARTIALLY DEFINED because the exact observable trigger behavior (whether tapping WhatsApp opens a chat, a pre-populated message, or another context) is deferred to the Integration stage. The product-level acceptance criterion is complete: both WhatsApp and WA Business must be available as broker-initiated choices, with no in-app messaging. The deferred detail does not block Stage 00.4.

---

## Acceptance Criteria — All 15 Journeys

---

### J-01 — Authenticate

**Preconditions**
None. First-time or returning broker.

**PASS Conditions**
- Broker has an authenticated session and can access their own ViewState data
- No data from any other broker is accessible
- Broker can proceed immediately to any other journey without completing a Profile
- Broker can proceed immediately without selecting or confirming a language
- App renders in Arabic / RTL immediately upon authenticated access without broker action

**Valid Empty / Failure States**
- New broker with no data — empty lists and inventory are valid, expected states
- Authentication attempt with invalid credentials — not granted; not a product defect

**FAIL Conditions**
- Broker can access another broker's Contacts, Properties, Requirements, Notes, or Matching data
- Broker is required to complete a Profile before any other journey can be started
- Broker is required to select or confirm a language before any other journey can be started
- App renders in English by default (without any broker action)
- Unauthenticated access to private broker data is possible

**Explicitly Not Tested Here**
Auth provider identity (DEC-008 PENDING). Session lifetime. Token format. Re-authentication flow. Account recovery. Sign-up flow.

---

### J-02 — Create Contact

**Preconditions**
Broker has an authenticated session.

**PASS Conditions**
- A Contact record with Name and Phone Number is saved and immediately retrievable
- Contact appears in the broker's Contact inventory after save
- Role was not required to complete the save
- The saved Contact is available for role assignment and enrichment at any later point
- Attempting to save with Name absent: save is refused; broker is informed; no partial record is created
- Attempting to save with Phone Number absent: save is refused; broker is informed; no partial record is created

**Valid Empty / Failure States**
- Broker's Contact list is empty before first save — valid state
- Save refused due to missing Name or Phone — expected enforcement, not a defect

**FAIL Conditions**
- Contact cannot be saved with only Name + Phone (any additional field is required for save)
- Contact cannot be saved without first assigning a role
- Contact is saved without a Name
- Contact is saved without a Phone Number
- Contact is not retrievable immediately after save
- A fifth role option is present beyond: Tenant · Buyer · Owner · Broker

**Explicitly Not Tested Here**
Full Contact field schema. Exact form field order. Exact validation error wording. Duplicate-detection behavior. International phone number formatting.

---

### J-03 — Create Property

**Preconditions**
Broker has an authenticated session. At least one Location Area is available (market-configured).

**PASS Conditions**
- A Property record is saved with all four minimum fields: Property Type + Purpose (Sale or Rent) + Price + Market-configured Location Area
- Property appears in the broker's Property inventory immediately after save
- The Property is eligible for broker-initiated Matching after save
- No optional enrichment field was required to complete the save
- Optional enrichment fields are available to add after save without re-saving from scratch

**Valid Empty / Failure States**
- Broker's Property inventory is empty before first save — valid state
- Save refused due to any one of the four required fields being missing — expected enforcement

**FAIL Conditions**
- A Property is accepted as saved or valid without all four minimum fields being present — all four must be present for validity
- Any field beyond the four minimum fields is required at initial save (Capture First violation)
- Property does not become eligible for Matching after save
- Property is not retrievable immediately after save

**Explicitly Not Tested Here**
Full Property field schema beyond minimum. Property Type enumeration values. Price format. Location Area selection mechanism (list / map / other).

---

### J-04 — Create Requirement

**Preconditions**
Broker has an authenticated session. At least one Contact exists with a Buyer role or a Tenant role (or both).

**PASS Conditions**
- A Requirement record is saved with: Property Type + explicit Purpose (Buy or Rent) + Budget Range, linked to a Buyer/Tenant Contact
- The Requirement becomes eligible for broker-initiated Matching after save
- The Purpose was explicitly set on the Requirement by the broker — it was not determined solely by Contact role. A UX pre-fill is permitted only when its source is a prior explicit broker/user choice within the current product flow and the value remains reviewable and changeable by the broker before save; Contact role alone is not an acceptable source
- A Buyer/Tenant Contact can hold multiple independent Requirements; saving a second Requirement does not replace the first
- No optional matching criteria were required for save

**Valid Empty / Failure States**
- Buyer/Tenant Contact has no Requirements yet — valid state
- Save refused due to missing one of the three minimum fields — expected enforcement

**FAIL Conditions**
- Requirement can be saved under an Owner-only Contact
- Requirement can be saved under a Broker-only Contact
- The Requirement Purpose does not exist explicitly on the saved Requirement — OR — the Purpose is determined by Contact role alone with no prior explicit broker choice as the source and no opportunity to review or change it before save
- Requirement saved without Property Type
- Requirement saved without Budget Range
- A Contact's second Requirement overwrites or replaces the first
- Requirement does not become eligible for Matching after save

**Explicitly Not Tested Here**
Full Requirement field schema. Budget Range format. Property Type enumeration values. Requirement lifecycle, status, priority, expiration — none exist in V001.

---

### J-05 — Import Contact

**Preconditions**
Broker has an authenticated session. At least one importable source is available (WhatsApp-related / WhatsApp Business-related / Device Contacts).

**PASS Conditions**
- A Contact record is created from source data
- All information available from the source is populated automatically — the broker is not asked to re-enter information the source provided
- If Name and Phone Number are both available from the source, the Contact meets minimum validity without any broker input
- If Name is unavailable from the source, only the Name is requested from the broker before save is permitted
- If Phone Number is unavailable from the source, only the Phone Number is requested from the broker before save is permitted
- The resulting imported Contact meets the same validity standard as a manually created Contact (Name + Phone)
- Role was not required at import time
- The imported Contact is immediately retrievable and available for enrichment

**Valid Empty / Failure States**
- Import source contains a record with neither Name nor Phone — broker must supply both; if not supplied, record is not saved — not a product defect
- Import source is empty or contains no importable records — not a product defect

**FAIL Conditions**
- Broker is required to re-enter information (Name, Phone, or other fields) that the source successfully provided
- A Contact is saved from import without a Name
- A Contact is saved from import without a Phone Number
- Role is required at import time
- Imported Contact is not retrievable or enrichable after save

**Explicitly Not Tested Here**
Technical import mechanism. WhatsApp-specific technical integration behavior. Permission flows. Property Import — not in V001.

---

### J-06 — Match Requirement → Properties (Direction A)

**Preconditions**
Broker has an authenticated session. At least one Requirement and at least one Property exist in the broker's data.

**PASS Conditions**
- Broker initiates Matching for a selected Requirement
- System compares the Requirement against all Properties in the broker's inventory
- Every compared Property receives a score in the range 0–100
- Every Property with a score ≥70% is surfaced as a qualifying match
- No Property with a score below 70% is surfaced as a qualifying match
- Each qualifying result is accompanied by an explanation using relevant matching reasons
- If no Property reaches 70%, "No Matches ≥70%" is presented — valid outcome, not an error
- Matching was triggered by an explicit broker action — not automatically, not in background

**Valid Empty / Failure States**
- No Properties reach 70%: "No Matches ≥70%" is presented — valid, successful outcome

**FAIL Conditions**
- Direction A is absent entirely from the product
- Any Property scoring below 70% is surfaced as a qualifying match
- Matching results include Properties from another broker's inventory
- Matching is triggered automatically without broker initiation
- Qualifying match results are shown without any explanation of the score/result
- AI or ML is used

**Explicitly Not Tested Here**
Scoring formula, weights, coefficients, field importance. Exact explanation structure. Score sort order and pagination. UI presentation of result list.

---

### J-07 — Match Property → Requirements / Clients (Direction B)

**Preconditions**
Broker has an authenticated session. At least one Property and at least one Requirement with an associated Buyer/Tenant Contact exist in the broker's data.

**PASS Conditions**
- Broker initiates Matching for a selected Property
- System compares the Property against all Requirements in the broker's inventory
- Every compared Requirement receives a score in the range 0–100
- Every Requirement with a score ≥70% is surfaced as a qualifying match
- No Requirement with a score below 70% is surfaced as a qualifying match
- Each qualifying Requirement result identifies the associated Buyer/Tenant Contact
- Each qualifying result is accompanied by an explanation using relevant matching reasons
- If no Requirement reaches 70%, "No Matches ≥70%" is presented — valid successful outcome
- All boundaries from J-06 apply: broker-initiated, private, per-broker, rule-based, non-AI, non-automatic, non-background, non-marketplace

**Valid Empty / Failure States**
- No Requirements reach 70%: "No Matches ≥70%" — valid successful outcome

**FAIL Conditions**
- Direction B is absent entirely from the product
- Any Requirement scoring below 70% is surfaced as a qualifying match
- The associated Buyer/Tenant Contact is not identifiable from a qualifying match result
- Matching results include Requirements from another broker's inventory
- Matching is triggered automatically or runs in background
- Any J-06 FAIL condition also applies here

**Explicitly Not Tested Here**
Same as J-06. Navigation from a match result to the associated Contact record.

---

### J-08 — Share Property with Contact

**Preconditions**
Broker has an authenticated session. At least one Property and at least one saved Contact exist in the broker's data.

**PASS Conditions**
- Broker initiates a sharing action for one specific Property directed at one specific saved Contact
- The recipient Contact may hold any role (Tenant, Buyer, Owner, Broker) or no role
- The sharing action is private — directed only at the selected Contact
- The sharing is conducted via WhatsApp or WhatsApp Business — broker's choice; both must be available
- The action is broker-initiated
- No public publishing, no marketplace distribution, and no bulk distribution occurs

**Valid Empty / Failure States**
- Broker has no Contacts — sharing cannot be initiated; not a product defect
- Broker has no Properties — sharing cannot be initiated; not a product defect

**FAIL Conditions**
- Property Sharing is restricted to Buyer or Tenant Contacts only — any exclusion of Owner, Broker, or no-role Contacts is a failure
- Sharing publishes the Property to any public or network-visible location
- Sharing distributes to multiple Contacts simultaneously without individual broker initiation per recipient
- Either WhatsApp or WhatsApp Business is not available as a sharing channel — both must be available
- Sharing occurs without explicit broker initiation

**Explicitly Not Tested Here**
Exact sharing payload / Property card format. Property-first vs Contact-first selection sequence. Exact WhatsApp mechanism. UX entry point.

---

### J-09 — Communicate with Contact

**Preconditions**
Broker has an authenticated session. At least one Contact with a phone number exists. Broker is in a relevant product context where communication is accessible.

**PASS Conditions**
- Broker can initiate communication with a specific Contact via WhatsApp
- Broker can initiate communication with a specific Contact via WhatsApp Business
- Both WhatsApp and WhatsApp Business are available as choices
- Communication is broker-initiated
- No in-app messaging occurs

**Valid Empty / Failure States**
- Contact has no phone number — communication cannot be initiated; not a product defect

**FAIL Conditions**
- Either WhatsApp or WhatsApp Business is unavailable as an option — both must be present
- In-app messaging is present
- Communication is initiated automatically without broker action

**Explicitly Not Tested Here**
Exact trigger behavior — whether the action opens a chat, prepares a message, or another flow. Whether direct voice-call launching is supported (not guaranteed). Exact integration mechanism.

---

### J-10 — Enrich Contact

**Preconditions**
Broker has an authenticated session. At least one Contact exists with minimum Name + Phone.

**PASS Conditions**
- Broker can assign one or more of the four approved roles to the Contact after initial save
- Broker can add additional Contact details after initial save
- Broker can add a Contact Note after initial save
- If a Buyer or Tenant role is assigned, the Contact becomes eligible to hold one or more Requirements
- Enrichment is accessible without re-creating the Contact from scratch

**Valid Empty / Failure States**
- Contact with no enrichment (only Name + Phone, no role, no note) is a fully valid state throughout its lifecycle

**FAIL Conditions**
- Any enrichment action requires a gate beyond the Contact having been initially saved
- After assigning a Buyer role, the Contact does not become eligible to hold a Requirement
- A fifth role can be assigned beyond Tenant · Buyer · Owner · Broker
- Contact Note cannot be added or edited after the Contact is saved

**Explicitly Not Tested Here**
Full Contact field schema. Exact note editor UX. Note character limit.

---

### J-11 — Enrich Property

**Preconditions**
Broker has an authenticated session. At least one Property exists with minimum four fields.

**PASS Conditions**
- Broker can add additional Property information after initial save
- Broker can attach at least one Photo to the Property
- Broker can attach at least one Video to the Property
- Broker can attach at least one Document to the Property
- Broker can add a Property Note (distinct from any Property Description field)
- Broker can assign Classification to the Property
- Enrichment does not retroactively invalidate the initially captured minimum fields

**Valid Empty / Failure States**
- Property with no enrichment (only four minimum fields) is fully valid throughout its lifecycle

**FAIL Conditions**
- Photos cannot be attached to Properties
- Videos cannot be attached to Properties
- Documents cannot be attached to Properties — all three media types must be available
- Property Note and Property Description exist as a single merged field
- Any enrichment field is required before a Property can participate in Matching

**Explicitly Not Tested Here**
Supported file formats, maximum file sizes, video codecs, storage mechanism. Number of media items per Property. Media display and playback implementation.

---

### J-12 — Enrich Requirement

**Preconditions**
Broker has an authenticated session. At least one Requirement exists with minimum three fields.

**PASS Conditions**
- Broker can add additional matching criteria to the Requirement beyond the initial minimum captured fields
- Additional criteria are persisted and applied in subsequent Matching runs
- The initially captured Requirement (Type + Purpose + Budget) remains valid without any enrichment

**Valid Empty / Failure States**
- Requirement with only minimum fields is fully valid and eligible for Matching

**FAIL Conditions**
- Additional matching criteria cannot be added after initial Requirement save
- Any enrichment field is required at initial capture time

**Explicitly Not Tested Here**
Full Requirement field schema. Specific enrichable matching criteria. How enrichment criteria affect Matching score.

---

### J-13 — Classify Contact or Property

**Preconditions**
Broker has an authenticated session. At least one Contact or Property exists.

**PASS Conditions**
- Broker can apply exactly one of the four approved labels: Follow Up · Important · Pending · Order Complete / Closed Deal — to a Contact or Property
- The applied label is immediately visible when the broker views the Contact or Property record in normal use — no additional navigation required
- The label can be changed through one direct action
- Classification does not create a task, reminder, date, calendar event, automation, or pipeline entry
- Removing (clearing) a classification requires only one direct action
- A Contact or Property without any classification is a fully valid state

**Valid Empty / Failure States**
- Record has no classification — valid default state

**FAIL Conditions**
- A fifth classification label is present
- More than one classification label is simultaneously active on a single Contact or Property record
- Classification is not visible when viewing the record in normal use
- Changing the classification requires more than one direct action
- Applying any classification label creates a task, reminder, date, or automated workflow
- Classification applies to Requirements, Notes, or Media items

**Explicitly Not Tested Here**
Exact visual placement (deferred to UX stage). Exact one-action mechanism design.

---

### J-14 — Configure Profile and Language

**Preconditions**
Broker has an authenticated session.

**PASS Conditions**
- Broker can change the display language to English
- Broker can change the display language back to Arabic
- When Arabic is selected, the app renders in RTL layout throughout
- When English is selected, the app renders in LTR layout throughout
- Language selection persists across sessions
- Default language is Arabic / RTL without any broker action required
- Broker can add or update Profile information without it being a prerequisite for any other journey
- No mandatory Profile completion is required at any point

**Valid Empty / Failure States**
- Profile with no enriched data — valid state
- Language remaining at Arabic/RTL default — fully valid state

**FAIL Conditions**
- Arabic is not available as a language
- English is not available as a language
- App does not apply RTL layout when Arabic is selected
- App does not apply LTR layout when English is selected
- Language change is prevented unless Profile is completed first
- App defaults to English or device locale instead of Arabic/RTL
- Broker is presented a mandatory language gate before accessing any other feature

**Explicitly Not Tested Here**
Exact UI location of language preference control. Exact Profile field set. Localization SDK. Arabic translation quality.

---

### J-15 — Global Search and Retrieve

**Preconditions**
Broker has an authenticated session. At least one Contact or Property exists in the broker's data.

**PASS Conditions**
- Global Search is accessible from within the primary app experience without the broker first navigating away
- Searching a Contact Name term returns matching Contact records when they exist
- Searching a Phone Number term returns matching Contact records when they exist
- Searching a Property Title term returns matching Property records when they exist
- Searching a Location Area term returns matching Property records when they exist
- Each result is clearly labeled as a Contact or a Property
- Requirements are not returned as direct search results
- Notes content is not searched
- Media filenames or content are not searched

**Valid Empty / Failure States**
- A search query against which no matching saved record exists returns zero results — valid state, not an error

**FAIL Conditions**
- Global Search is absent or requires navigating to a non-primary area to access
- A Contact whose Name matches the search term is not returned when it exists
- A Contact whose Phone Number matches the search term is not returned when it exists
- A Property whose Title matches the search term is not returned when it exists
- A Property whose Location Area matches the search term is not returned when it exists
- Results do not distinguish between Contact and Property results
- Requirements appear as direct search results
- Notes content appears as direct search results
- AI or semantic search is active
- Search returns results from another broker's inventory

**Explicitly Not Tested Here**
Exact search placement. Search-as-you-type vs. submit-button behavior. Result grouping, sorting, pagination. Partial vs. exact matching behavior. Advanced query language.

---

## Capture First Acceptance

### Contact
**PASS:** A Contact is saved with Name + Phone Number as the only required inputs. Role, notes, additional details, and all enrichment fields are absent from the required save path.
**FAIL:** Any field beyond Name and Phone Number is required at save time.

### Property
**PASS:** A Property is saved with all four minimum fields — Property Type + Purpose + Price + Market-configured Location Area — as the only required inputs. Photos, Videos, Documents, Notes, Classification, and all enrichment fields are absent from the required save path.
**FAIL:** Any of the four minimum fields is not required (Capture First violation in reverse: making a minimum field optional). Any enrichment field is required at save time.

### Requirement
**PASS:** A Requirement is saved with Property Type + explicit Purpose + Budget Range as the only required inputs. Additional matching criteria are not required.
**FAIL:** Any field beyond the three minimum fields is required at save time.

### Contact Import
**PASS:** All source-available fields populate automatically without broker action. If both Name and Phone are available from the source, the record saves without broker input. If one minimum field is missing, only that one is requested. Role is not required.
**FAIL:** Broker is required to re-enter any value the source successfully provided. Role is required at import time.

---

## 10–15 Second Capture Target

**Frozen product target:** BASIC capture of a Contact, Property, or Requirement should take approximately 10–15 seconds. This is a product design constraint, not a measured outcome.

**Accepted at Product Definition stage:** The minimum required fields for each entity type (2 for Contact, 4 for Property, 3 for Requirement) are structurally lean enough that the 10–15 second target is feasible in a well-designed mobile interface. The field specification does not structurally preclude the target.

**Cannot be certified now:** Actual timing requires a working implementation (Implementation stage task-timing test) and usability testing with real broker users (Beta stage).

| Level | Acceptance |
|-------|-----------|
| Product Definition | Field counts are compatible with target — accepted now |
| Implementation | Verified by structured task-timing test with working implementation |
| Beta | Validated by real broker users in field conditions, in Arabic |

Timing may not be falsely certified before a working implementation exists.

---

## Matching Acceptance

| Element | Acceptance |
|---------|-----------|
| Direction A — Requirement→Properties | Must be present and functional. Absent = V001 rejected |
| Direction B — Property→Requirements/Clients | Must be present and functional. Absent = V001 rejected |
| Score 0–100 | Every compared record receives a numeric score in this range |
| Explain | Every qualifying result (≥70%) accompanied by explanation using relevant matching reasons |
| ≥70% threshold | All records at or above 70% surfaced; no record below 70% surfaced as qualifying |
| Zero-match validity | "No Matches ≥70%" is a valid successful outcome in both directions |
| Broker initiation | Begins only by explicit broker action; no automatic or background triggering |
| Associated Contact (Direction B) | Buyer/Tenant Contact identifiable from each qualifying Requirement result |
| Non-AI / rule-based | Must not depend on ML or AI to function |
| Per-broker / private | No result from another broker's data surfaced |
| Scoring formula | Fully deferred — not part of V001 product-level acceptance |

---

## Global Search / Classification / Communication / Sharing Acceptance

### Global Search
Searchable concepts (all four required): Contact Name · Phone Number · Property Title · Location Area.
When a matching saved record exists for any of these concepts, it must be retrievable. Zero results for a query with no matching record is valid.
Not searchable: Requirements · Notes · Media.
Not supported: AI search · semantic search · saved searches.
Quickly accessible throughout the primary app experience.
Results labeled as Contact or Property. Exact placement deferred to UX stage.

### Classification
Applies to Contact and Property only. Exactly four labels: Follow Up · Important · Pending · Order Complete / Closed Deal. One label at a time per record. Immediately visible during normal record use. Changeable through one direct action. No task, reminder, date, or automation created. Records with no classification are valid. Exact visual placement deferred to UX stage.

### Communication
Both WhatsApp and WhatsApp Business must be available as broker-initiated choices. No in-app messaging. Exact trigger behavior deferred to Integration stage.

### Property Sharing
Private · broker-initiated · one Property · one saved Contact of any role (including no role) · via WhatsApp or WhatsApp Business (both available). No bulk, automated, scheduled, public, or marketplace sharing. Payload format, card design, and entry point sequence deferred.

---

## Cross-Product Acceptance

### A. Capture → Organize → Act

| Layer | Covered By | Coverage |
|-------|-----------|---------|
| Capture | J-02 · J-03 · J-04 · J-05 | Complete |
| Organize | J-10 · J-11 · J-12 · J-13 · J-15 · Notes (J-10/J-11) · Location (J-03/J-11) · Media (J-11) | Complete |
| Act | J-06 · J-07 · J-08 · J-09 | Complete |

No genuine gap identified. All three layers are fully represented across the 15 frozen journeys and 15 frozen V001 capabilities.

### B. Private Per-Broker
**PASS:** A logged-in broker cannot observe any Contact, Property, Requirement, Note, or Matching result belonging to a different broker — through any navigation path, search result, or Matching run.
**FAIL:** Any observable cross-broker data leakage in any journey.
No database mechanism specified here. Observable product behavior only.

### C. Arabic / English Bilingual
**PASS:** Full product experience renders in Arabic with RTL layout by default. Full product experience renders in English with LTR layout when selected. Switching is possible at any time.
**FAIL:** Arabic absent. English absent. RTL not applied for Arabic. LTR not applied for English. Any journey is partially untranslated in one language.

### D. Capture First
No optional enrichment may silently become a required prerequisite for valid save across any entity type. Confirmed as cross-product acceptance. See Capture First Acceptance section above.

### E. Matching North Star
V001 is unacceptable if either Matching direction is absent or produces results inconsistent with the frozen product model (≥70% threshold · explained results · broker-initiated · non-automatic · non-AI). Both directions must follow the same frozen pattern: Compare → Score (0–100) → Explain.

---

## V001 Release-Blocking Conditions (35 — Final Corrected)

Any single condition being true means **V001 must not be accepted as functionally complete:**

1. Matching Direction A (Requirement→Properties) is absent
2. Matching Direction B (Property→Requirements/Clients) is absent
3. Any Property or Requirement scoring below 70% is surfaced as a qualifying match in either direction
4. A qualifying match result in either direction is presented without any explanation of the score/result using relevant matching reasons
5. Matching is triggered automatically, runs in the background, or sends unsolicited notifications without broker initiation
6. A BASIC Contact cannot be saved with only Name + Phone Number (any field beyond these two is required)
7. Role must be assigned before a Contact can be saved
8. A Requirement can be created or saved under an Owner-only Contact
9. A Requirement can be created or saved under a Broker-only Contact
10. The Requirement Purpose does not exist explicitly on the saved Requirement — OR — the Requirement Purpose is determined by Contact role alone, with no prior explicit broker/user choice in the current product flow as the source, and no opportunity to review or change it before save. Contact role alone is not an acceptable source for determining Requirement Purpose. A UX pre-fill is permitted only when its source is a prior explicit broker/user choice within the current product flow and the value remains reviewable and changeable by the broker before save.
11. A Property is accepted as saved or valid without all four minimum fields being present — Property Type, Purpose (Sale or Rent), Price, and Market-configured Location Area must all be present for a BASIC Property to be valid. The absence of any single one of these four means the record must not be savable. Additionally: any field beyond these four is required at initial save (Capture First violation) and is equally a release-blocking failure.
12. BASIC Requirement cannot be saved with only Type + Purpose + Budget Range (any additional field is required at initial save)
13. Property Sharing is restricted to Buyer/Tenant recipient Contacts only — any exclusion of Owner, Broker, or no-role Contacts is a failure
14. Either WhatsApp or WhatsApp Business is unavailable as an approved choice for Communication (J-09) or Property Sharing (J-08) — both must remain available; the absence of either one is a release-blocking failure
15. Any other broker's private data — Contacts, Properties, Requirements, Notes, or Matching context — is observable to a logged-in broker
16. The app does not render in Arabic / RTL (Arabic/RTL is the default and must function)
17. The app does not render in English / LTR, or English is unavailable or unusable as a selectable language — both Arabic and English must function
18. Authentication is not required before accessing private broker data
19. Media (Photos, Videos, or Documents) cannot be attached to Properties — all three types must be supported per the frozen V001 capability definition (Media & Attachments, Capability #12, Stage 00.2.1 / Stage 00.2.2)
20. Contact Notes cannot be added to Contacts
21. Property Notes cannot be added to Properties
22. Global Search searches Requirements, Notes, or Media content
23. Global Search is absent from the primary app experience
24. Any of the four frozen searchable concepts is not searchable, or when a relevant matching saved record exists, it is not retrievable through that concept: Contact Name, Phone Number, Property Title, Location Area — all four must be searchable and must return matching saved records when they exist. Zero results for a valid search query against which no matching record exists is a valid outcome and is not a failure.
25. Classification introduces a task, reminder, date, calendar event, automation, or pipeline entry of any kind
26. A fifth classification label exists beyond: Follow Up · Important · Pending · Order Complete / Closed Deal
27. Multiple classification labels are simultaneously active on a single Contact or Property record
28. Any of the following OUT OF V001 features are present in the delivered product: Tasks, Reminders, Calendar workflow, Deal Management, Broker-to-Broker Marketplace, Public Property Portal, AI Assistant
29. Property Import is present in V001
30. Full Export System is promoted into V001
31. A broker is required to complete a Profile before accessing any feature after authentication
32. A broker is required to select or confirm a language before accessing any feature after authentication
33. Any of the three frozen V001 Contact Import sources is absent: WhatsApp-related Contact capture, WhatsApp Business-related Contact capture, Device Contacts — all three must be present as available import paths; absence of any one is a release-blocking failure
34. The product does not support the capability for a single Contact to hold two or more of the four approved roles (Tenant · Buyer · Owner · Broker) when applicable — if the product prevents a Contact from being assigned more than one role, V001 fails acceptance. A Contact with zero roles at capture or exactly one role is fully valid; this blocker applies only when the product structurally prevents multi-role assignment.
35. A Buyer/Tenant Contact cannot hold more than one independent Requirement — multiple independent Requirements per Buyer/Tenant Contact must be supported

---

## Three-Level Success Model

All three levels must remain separate.

### Level 1 — Product Definition Acceptance (Stage 00.4 — this stage)
The product behavior is correctly, completely, and unambiguously specified at a level sufficient to guide implementation. Frozen governance accurately describes what the product does, for whom, under what conditions, and what observable outcomes constitute success or failure. No implementation mechanism is required. This level is closed by Stage 00.4.

### Level 2 — Implementation Acceptance (Implementation + Testing stages)
A working implementation satisfies each frozen journey's PASS conditions. Every release-blocking condition is absent. The product renders in both Arabic/RTL and English/LTR. Media attachment, Matching in both directions with ≥70% threshold enforcement, explanation of results, and all 15 capabilities are present and verifiable by technical and functional testing. The 10–15 second capture target is assessed by structured task-timing tests against the working implementation.

### Level 3 — Beta Acceptance (Beta stage)
Real broker users, in actual field conditions, can successfully complete the primary journeys. The 10–15 second BASIC capture target is validated by real-user usability testing in Arabic. Arabic/RTL layout is confirmed legible and usable. Friction points inform the post-V001 improvement roadmap.

**Rationale for separation:** Collapsing Product Definition with Implementation testing creates premature commitments. Collapsing Implementation with Beta conflates technical correctness with real-user usability — V001 could pass all technical tests and still fail at field usability. Each level requires distinct evaluation methods and produces different types of evidence.

---

## Governance Consistency Findings

| Finding | Classification | Blocks Stage 00.4? | Required Action |
|---------|---------------|-------------------|----------------|
| Stage 00.2.3 placeholder label exists with no content defined | C — Governance Cleanup Candidate | No | Resolve in Governance Cleanup Pass before Stage 01 |
| `docs/database/README.md` — premature OTP, WhatsApp raw-file parsing/retention, soft-delete, ER schema assumptions | C — Governance Cleanup Candidate | No | Resolve in Governance Cleanup Pass; not authoritative |
| `docs/ux/README.md` — premature tab structure, persistent Matches-tab, blue top header, Notifications assumptions | C — Governance Cleanup Candidate | No | Resolve in Governance Cleanup Pass; not authoritative |
| `docs/modules/README.md` — incomplete module index (missing Contact Notes, Property Notes) | C — Governance Cleanup Candidate | No | Resolve in Governance Cleanup Pass |
| `README.md` Rule 14 — "blue top header" and "global search in the header" pre-commitments; deferred/removed as frozen assumptions by Stage 00.3 CTO corrections | C — Governance Cleanup Candidate | No | Correct during Governance Cleanup Pass; Stage 00.3 frozen governance takes precedence |
| `ARCHITECTURE.md` media layer — describes "Photo upload" only; does not reflect Photos + Videos + Documents per frozen V001 capability definition (Stage 00.2.1 / Stage 00.2.2, Capability #12) | C — Governance Cleanup Candidate | No | Correct at Architecture stage; frozen governance takes precedence |
| Matching scoring formula, weights, algorithm — not defined in frozen governance | B — Later-Stage Implementation Decision | No | Deferred by design (DEC-023) |
| 10–15 second capture target — cannot be measured at product definition stage | B — Later-Stage Implementation Decision | No | Measured at Implementation stage (task-timing) and Beta stage (real users) |
| Market-configured Location Area — Kuwait area taxonomy content not yet defined | B — Later-Stage Implementation Decision | No | Deferred to Market Configuration stage |
| DEC-008 (auth provider) PENDING | B — Later-Stage Implementation Decision | No | Foundation stage decision |
| DEC-009 (object storage provider) PENDING | B — Later-Stage Implementation Decision | No | Architecture/Media stage decision |
| No frozen governance contradiction found across Stages 00.1–00.3 | A — Resolved by Frozen Governance | No | No action |

**No Category D (Genuine Product Ambiguity) or Category E (Frozen Governance Contradiction) findings.**

---

## Founder Decisions Required

`No unresolved Founder decisions required for Stage 00.4.`

All open items are either Later-Stage Implementation Decisions (Category B) or Governance Cleanup Candidates (Category C). No frozen governance gap prevents the complete specification of product-level acceptance criteria for any of the 15 journeys.

---

## What Is NOT Frozen by Stage 00.4

| Topic | Deferred to |
|-------|------------|
| Auth provider (DEC-008 PENDING) | Foundation stage |
| Object storage provider (DEC-009 PENDING) | Architecture/Media stage |
| Session lifetime and re-authentication behavior | Foundation/Auth stage |
| Matching scoring formula, weights, algorithm | Implementation stage |
| Matching explanation exact structure and fields | Implementation stage |
| Matching scoring architecture (internal design) | Implementation stage |
| Property location selection mechanism (list/map/other) | UX stage |
| Kuwait area taxonomy (names, groupings, IDs) | Market Configuration stage |
| Classification exact visual placement | UX stage |
| Global Search exact placement and presentation | UX stage |
| Language preference control exact UI location | UX stage |
| WhatsApp / WA Business technical integration mechanism | Integration stage |
| Property Sharing payload format and card design | Integration / UX stages |
| Property Sharing UX entry point and selection sequence | UX stage |
| Contact Import technical mechanism | Integration stage |
| Contact complete field schema | Database stage |
| Property complete field schema | Database stage |
| Requirement complete field schema | Database stage |
| Media storage, file types, size limits, codecs | Architecture / Database / Media stages |
| Arabic translations (ar.json) | Founder-authored, before UI stage |
| Database schema, column names, types, constraints | Database stage |
| All V001 deferred capabilities (Full Export, Market Config Admin, Backup/Sync, Commission, Analytics) | Post-V001 or designated stage |
| Implementation Acceptance (Level 2) | Implementation + Testing stages |
| Beta Acceptance (Level 3) | Beta stage |

---

## Change Policy for Frozen Stage

This stage is governed by **Change Policy Category A — Governance changes** (highest risk).

**Process for any future change to Stage 00.4 content:**
1. Founder proposes the change in writing with rationale
2. AI shows the exact diff of what would change
3. Founder explicitly confirms
4. AI applies the change
5. A new decision entry is logged in DECISIONS.md with date, reason, and reference to this freeze record

---

## Implementation Status at Freeze

**PRE-IMPLEMENTATION — confirmed.**
Zero product feature code has been written or modified. The app scaffold is a blank Expo shell with no product UI. All implementation layers remain locked pending explicit Founder authorization.

---

## Next Stage

**Stage 00.5** (if defined) or **Stage 01** has NOT started. Neither may begin until the Founder explicitly authorizes the next stage.

The Founder may authorize the next stage at any time by issuing the explicit authorization command for that stage.
