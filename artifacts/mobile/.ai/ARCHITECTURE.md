# ViewState App — Architecture

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Current Effective Architecture Contract

React Native + Expo remains approved for one Android/iOS product. Android-first rollout does not permit Android-only architecture; iOS compatibility is maintained continuously. Expo Go is a preview/testing option, not an exclusive dependency gate. Shared business rules, persistence, APIs, privacy, Draft recovery, import/export boundaries, and future Card formats remain platform-neutral; native capabilities use replaceable adapters.

### Persistence Authority Boundary

- **Implemented mobile runtime:** Local SQLite and AsyncStorage persistence, together with the shared mobile domain validation and contracts, are the current authority for the running mobile app's persisted data and runtime data shape.
- **Future server architecture:** PostgreSQL with Drizzle ORM is reserved for future server-side persistence. The Drizzle schema is not the current mobile runtime schema authority and does not replace the implemented local persistence boundary.
- **Boundary rule:** Any future synchronization or server-backed persistence must define an approved mapping between the local mobile boundary and the server boundary; this documentation correction does not authorize that work.


## Mandatory Governance Lifecycle

Founder
→ CTO Review
→ Impact Analysis
→ Founder Approval
→ Implementation
→ Testing
→ CTO Review
→ Freeze
→ WAIT

No IMPLEMENT command may bypass CTO Review, Impact Analysis, or Founder approval.

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Mobile client | React Native + Expo (SDK 53+) | Android-first rollout and pilot; continuous iOS architectural compatibility |
| Routing | Expo Router (file-based) | NativeTabs on iOS 26+, classic Tabs fallback |
| State (server) | TanStack React Query | Future server data goes through generated hooks |
| State (local) | React Context + SQLite/AsyncStorage | Implemented mobile persistence and local runtime state |
| Backend | Express 5 + TypeScript | Monorepo: `artifacts/api-server` |
| Database | PostgreSQL + Drizzle ORM | Future server-side persistence architecture; not the current mobile runtime schema |
| Validation | Shared domain validation/contracts; Zod v4 + drizzle-zod for future server use | Mobile and future server boundaries remain distinct |
| API contract | OpenAPI 3.1 → Orval codegen | `lib/api-spec/openapi.yaml` |
| Auth | TBD (Founder decision pending) | See DECISIONS.md DEC-005 |
| Media / Object storage | TBD (Founder decision pending) | See DECISIONS.md DEC-006 |
| Localization | expo-localization + i18n | ar / en, RTL/LTR |

---

## V001 Module Map

The expanded Stage 01 Impact Analysis is not started and requires fresh Founder authorization. When separately authorized, it may assess transaction-first built-property capture for Sale and Rent: exact offered property or independently offered unit selection, relevant conditional field categories, Property/Offer/Unit alternatives, Draft/no-silent-loss implications, and minimum technical impacts. Land remains a separate later V001 workflow. This is analysis only: it approves no final architecture, data model, schema, API, dependency, UI, or implementation. Authentication, broad database design, broad API infrastructure, Contacts, Requirements, Matching, Tasks, imports, sharing, media, and other modules remain separately locked.

```
ViewState V001
│
├── STAGE 01 FUTURE ANALYSIS (fresh Founder authorization required)
│   └── Property Capture Architecture & Dynamic Form Impact Analysis
│       (Sale & Rent — Built Properties; Land Workflow Separate)
│       implementation remains locked
│
├── OTHER V001 MODULES (separately locked)
│   ├── Foundation / Auth / Database / API → remain locked; only impacts may be assessed within a separately authorized analysis
│   ├── Contacts Module → separately authorized later
│   ├── Requirements Module → separately authorized later
│   ├── Matching Engine → separately authorized later
│   ├── Tasks / Follow-ups → separately authorized later
│   ├── WhatsApp and Contacts Import → separately authorized later
│   ├── Media / Storage → separately authorized later
│   └── Global Search → separately authorized with relevant modules
│
└── UI / SCREENS → separately locked; no broad UI implementation authorized
```

## Architecture Rules

### 1. Module isolation
Each module has its own folder: `src/modules/<module-name>/`. A module may not import from another module's internal files — only from its public `index.ts` export.

### 2. No business logic in screens
Screen files (`app/**/*.tsx`) must contain zero business logic. They render UI, call hooks, and dispatch actions. All logic lives in context providers, service files, or the API server.

### 3. API-first
Every client–server interaction goes through the OpenAPI spec → Orval-generated hooks. No hand-rolled fetch calls for endpoints that exist in the spec.

### 4. Bilingual from day one
Application UI and system-authored content are localized in Arabic and English. User-entered and imported names, notes, descriptions, and source text remain literal and must not be automatically translated or duplicated.

### 5. Persistence authority follows the runtime boundary
The implemented mobile runtime uses local SQLite/AsyncStorage persistence and shared domain validation/contracts as its current authority. PostgreSQL and the Drizzle schema in `lib/db/src/schema/` are future server-side architecture; they are not the current mobile runtime schema authority. Future server types may derive from Drizzle via drizzle-zod, but they must not be treated as the mobile runtime contract without an approved boundary mapping.

### 6. Matching is rule-based in V001 (Rule 12)
No ML, no embeddings, no vector search. Simple field-to-field comparison with scoring. Architecture must allow upgrading in V002 without breaking the API contract.

### 7. Architecture-ready for future (Rule 17)
Every module boundary, data model, and API contract must be designed so that AI Brain expansion, Network Marketplace, and platform integrations can be added in V002+ without breaking V001. Document future extension points in each module's architecture section.

### 8. Offline-tolerant
Every list screen serves cached data when offline. Use React Query `staleTime` and `gcTime` appropriately.

### 9. Global Search architecture (Rule 13)
Global Search is not a standalone feature — it is a shared utility. Implement it as a reusable `useGlobalSearch` hook and a `GlobalSearchBar` component that lives in the blue header (Rule 14). Every primary screen imports the same component.

---

## Layer Build Order (enforced by Governance Rule 6)

The active implementation order begins with a bounded analysis, not with a requirement to implement the complete Foundation/Auth layer.

```
1. Governance Package                                      ← ✅ COMPLETE
2. Fresh Founder authorization for Stage 01 expanded Impact Analysis ← NEXT REQUIRED AUTHORIZATION
3. Stage 01 Property Capture Architecture & Dynamic Form Impact Analysis (Sale & Rent — Built Properties; Land Workflow Separate) ← 🔒 LOCKED until authorized
4. Minimum technical foundation for that analysis          ← only if separately justified and approved
5. Foundation / Auth / broad Database / broad API           ← 🔒 separately locked
6. Contacts / Requirements / Matching / Tasks               ← 🔒 separately locked
7. Imports / Sharing / Media / Global Search                 ← 🔒 separately locked
8. UI / Screens / Polish / testing / release                ← 🔒 separately locked
```

Each implementation step requires the exact mandatory lifecycle: Founder → CTO Review → Impact Analysis → Founder Approval → Implementation → Testing → CTO Review → Freeze → WAIT. No IMPLEMENT command may bypass CTO Review, Impact Analysis, or Founder approval.

## File Structure (target — not yet implemented)

```
artifacts/mobile/
  app/
    _layout.tsx              ← root layout, providers
    (auth)/
      _layout.tsx
      login.tsx              ← phone entry
      verify.tsx             ← OTP
      register.tsx           ← profile setup
    (tabs)/
      _layout.tsx            ← tab navigator with GlobalSearchBar in header
      index.tsx              ← Dashboard / Home
      properties.tsx         ← Property list
      contacts.tsx           ← Contacts list
      matches.tsx            ← Matches list
    property/
      [id].tsx               ← Property detail
      create.tsx             ← Create (Capture First)
      edit/[id].tsx          ← Edit / Enrich
    contact/
      [id].tsx               ← Contact detail
      create.tsx             ← Add contact
    match/
      [id].tsx               ← Match detail with score breakdown
    import/
      whatsapp.tsx           ← WhatsApp import flow
      contacts.tsx           ← Device contacts import
    settings/
      index.tsx              ← Settings / Profile
  src/
    modules/
      contacts/              ← index.ts + types + hooks + utils + components
      properties/
      requirements/
      matching/
      whatsapp-import/
      media/
    components/
      GlobalSearchBar.tsx    ← shared search component (in every tab header)
      [other shared components]
    constants/
    hooks/
    i18n/
      ar.json
      en.json
    lib/
  assets/
  .ai/                       ← Governance Package
  docs/                      ← Documentation
```


---
