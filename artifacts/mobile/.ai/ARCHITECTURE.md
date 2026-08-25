# ViewState App — Architecture

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Current Effective Architecture Contract

React Native + Expo remains approved for one Android/iOS product. Android-first rollout does not permit Android-only architecture; iOS compatibility is maintained continuously. Expo Go is a preview/testing option, not an exclusive dependency gate. Shared business rules, persistence, APIs, privacy, Draft recovery, import/export boundaries, and future Card formats remain platform-neutral; native capabilities use replaceable adapters.


## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Mobile client | React Native + Expo (SDK 53+) | Android-first rollout and pilot; continuous iOS architectural compatibility |
| Routing | Expo Router (file-based) | NativeTabs on iOS 26+, classic Tabs fallback |
| State (server) | TanStack React Query | All server data goes through generated hooks |
| State (local) | React Context + AsyncStorage | Auth state, preferences, offline cache |
| Backend | Express 5 + TypeScript | Monorepo: `artifacts/api-server` |
| Database | PostgreSQL + Drizzle ORM | `lib/db` — schema-as-code |
| Validation | Zod v4 + drizzle-zod | Shared between server and client |
| API contract | OpenAPI 3.1 → Orval codegen | `lib/api-spec/openapi.yaml` |
| Auth | TBD (Founder decision pending) | See DECISIONS.md DEC-005 |
| Media / Object storage | TBD (Founder decision pending) | See DECISIONS.md DEC-006 |
| Localization | expo-localization + i18n | ar / en, RTL/LTR |

---

## V001 Module Map

```
ViewState V001
│
├── FOUNDATION (built first — unlocked by Founder)
│   ├── Auth layer (login / register / OTP / session)
│   ├── Database schema (users, contacts, properties, requirements, matches)
│   └── API server base routes
│
├── CORE MODULES (built after foundation)
│   ├── Contacts Module     → create / manage / role-assign contacts
│   │                         Person classifications: Seeker, Owner, Broker, Real Estate Company, Building Guard
│   ├── Properties Module   → create / edit / list / search properties
│   ├── Requirements Module → Seeker-owned Requirement entry and storage
│   └── Matching Engine     → Compare + Score + Explain (Rule 12)
│
├── IMPORT LAYER (built after core)
│   ├── WhatsApp Import     → parse exported chat .txt for leads
│   └── Contacts Import     → read device contacts
│
├── SEARCH LAYER (core utility — built with each module)
│   └── Global Search       → available on every primary screen (Rule 13)
│                             Lives in blue top header (Rule 14)
│
├── MEDIA LAYER
│   └── Photo upload        → property images, stored in object storage
│
└── UI / SCREENS (built last)
    ├── Onboarding / Auth
    ├── Dashboard (Home)
    ├── Properties screens
    ├── Contacts screens
    ├── Matches screens
    ├── Import screens
    └── Settings / Profile
```

---

## Architecture Rules

### 1. Module isolation
Each module has its own folder: `src/modules/<module-name>/`. A module may not import from another module's internal files — only from its public `index.ts` export.

### 2. No business logic in screens
Screen files (`app/**/*.tsx`) must contain zero business logic. They render UI, call hooks, and dispatch actions. All logic lives in context providers, service files, or the API server.

### 3. API-first
Every client–server interaction goes through the OpenAPI spec → Orval-generated hooks. No hand-rolled fetch calls for endpoints that exist in the spec.

### 4. Bilingual from day one
Application UI and system-authored content are localized in Arabic and English. User-entered and imported names, notes, descriptions, and source text remain literal and must not be automatically translated or duplicated.

### 5. Database schema is law
The Drizzle schema in `lib/db/src/schema/` is the single source of truth. Types derive from it via drizzle-zod. Never hand-write a type that duplicates a schema type.

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

```
1. Governance Package          ← ✅ COMPLETE
2. Foundation (auth + DB + API base)    ← 🔒 LOCKED
3. Property Module                       ← 🔒 LOCKED
4. Contacts Module                       ← 🔒 LOCKED
5. Requirements Module                   ← 🔒 LOCKED
6. Matching Engine                       ← 🔒 LOCKED
7. WhatsApp Import                       ← 🔒 LOCKED
8. Media Layer                           ← 🔒 LOCKED
9. UI / Screens                          ← 🔒 LOCKED
10. Polish, testing, release             ← 🔒 LOCKED
```

Each layer is locked until the Founder says `IMPLEMENT: [layer name]`.

---

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
