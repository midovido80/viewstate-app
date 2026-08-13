# ViewState App — Architecture Boundaries

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Mobile client | React Native + Expo (SDK 53+) | iOS primary, Android secondary |
| Routing | Expo Router (file-based) | NativeTabs on iOS 26+, classic Tabs fallback |
| State (server) | TanStack React Query | All server data goes through generated hooks |
| State (local) | React Context + AsyncStorage | For auth state, preferences, offline cache |
| Backend | Express 5 + TypeScript | Monorepo: `artifacts/api-server` |
| Database | PostgreSQL + Drizzle ORM | `lib/db` — schema-as-code |
| Validation | Zod v4 + drizzle-zod | Shared between server and client |
| API contract | OpenAPI 3.1 → Orval codegen | `lib/api-spec/openapi.yaml` |
| Auth | TBD (Clerk or Replit Auth) | Awaiting Founder decision |
| Media / Object storage | TBD | Awaiting Founder decision |
| Localization | i18n-js or expo-localization | ar / en, RTL layout |

---

## Module Map

```
ViewState App
│
├── FOUNDATION (must be built first)
│   ├── Auth layer (login / register / session)
│   ├── Database schema (users, properties, requirements, matches)
│   └── API server routes (CRUD foundation)
│
├── CORE MODULES (built after foundation)
│   ├── Property Module     → create / edit / list / search properties
│   ├── Contacts Module     → import / manage buyers and brokers
│   ├── Requirements Module → buyer requirement entry and storage
│   └── Matching Engine     → rule-based property ↔ requirement matching
│
├── IMPORT LAYER (built after core)
│   ├── WhatsApp Import     → parse exported chat .txt files for leads
│   └── Contacts Import     → read device contacts, map to buyers/brokers
│
├── MEDIA LAYER
│   └── Photo upload        → property images, stored in object storage
│
└── UI / SCREENS (built last — no feature logic lives here)
    ├── Onboarding / Auth screens
    ├── Property screens (list, detail, create, edit)
    ├── Contact screens (list, detail, import)
    ├── Match screens (list, detail, notification)
    └── Settings / Profile screens
```

---

## Architecture Rules

### 1. Module isolation
Each module has its own folder: `src/modules/<module-name>/`. A module may not import from another module's internal files — only from its public index export.

### 2. No business logic in screens
Screen files (`app/**/*.tsx`) must contain zero business logic. They render UI, call hooks, and dispatch actions. All logic lives in context providers, service files, or the API server.

### 3. API-first
Every client–server interaction goes through the OpenAPI spec → Orval-generated hooks. No hand-rolled fetch calls for endpoints that exist in the spec.

### 4. Bilingual from day one
Every data model that has user-visible text fields must have both `_ar` and `_en` variants (e.g., `title_ar`, `title_en`). The UI layer picks the correct one based on locale.

### 5. Database schema is law
The Drizzle schema in `lib/db/src/schema/` is the single source of truth. API response shapes derive from it via drizzle-zod. Never hand-write a type that duplicates a schema type.

### 6. No AI in the matching engine (v1)
The matching engine is purely rule-based in the beta. No ML, no embeddings, no vector search. Simple field-to-field comparison with scoring.

### 7. Offline-tolerant UI
Every list screen must have an offline/error state. Use React Query's `staleTime` and `gcTime` to serve cached data when the network is unavailable.

---

## Layer Build Order (enforced)

```
1. Governance Package        ← YOU ARE HERE
2. Foundation (auth + DB + API base)
3. Property Module
4. Contacts Module
5. Requirements Module
6. Matching Engine
7. WhatsApp Import
8. Media Layer
9. UI / Screens
10. Polish, testing, release
```

Each layer is locked until the Founder explicitly says "IMPLEMENT: [layer name]".

---

## File Structure (target, not yet implemented)

```
artifacts/mobile/
  app/
    _layout.tsx              ← root layout, providers
    (auth)/                  ← login, register, onboarding
    (tabs)/                  ← main tab navigator
      index.tsx              ← Home / Dashboard
      properties.tsx         ← Property list
      contacts.tsx           ← Contacts list
      matches.tsx            ← Matches list
      settings.tsx           ← Settings / profile
    property/
      [id].tsx               ← Property detail
      create.tsx             ← Create property
    contact/
      [id].tsx               ← Contact detail
    match/
      [id].tsx               ← Match detail
  src/
    modules/
      properties/
      contacts/
      requirements/
      matching/
      whatsapp-import/
      media/
    components/              ← shared UI components
    constants/               ← colors, typography, spacing
    hooks/                   ← shared hooks
    i18n/                    ← translation files (ar.json, en.json)
    lib/                     ← utility helpers
  assets/
    images/
    fonts/
  .ai/                       ← Governance Package (this directory)
  docs/                      ← Documentation areas
```
