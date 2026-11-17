# ViewState — Modules Documentation

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

This directory contains the technical documentation for each ViewState module. A module doc is written **before** the module is implemented — it serves as the implementation contract.

---

## Module Index

| Module | Status | Doc |
|--------|--------|-----|
| Auth | 🔒 NOT STARTED | [auth.md](./auth.md) — to be written |
| Properties | 🔒 NOT STARTED | [properties.md](./properties.md) — to be written |
| Contacts | 🔒 NOT STARTED | [contacts.md](./contacts.md) — to be written |
| Requirements | 🔒 NOT STARTED | [requirements.md](./requirements.md) — to be written |
| Matching Engine | 🔒 NOT STARTED | [matching.md](./matching.md) — to be written |
| WhatsApp Import | 🔒 NOT STARTED | [whatsapp-import.md](./whatsapp-import.md) — to be written |
| Media | 🔒 NOT STARTED | [media.md](./media.md) — to be written |

---

## Module Doc Template

When writing a module doc before implementation, use this template:

```markdown
# [Module Name] Module

## Purpose
[One sentence: what problem does this module solve?]

## Scope
[What this module owns / does NOT own]

## Public API
[The functions, hooks, and types this module exports to other parts of the app]

## Data
[DB tables owned, fields used]

## Flows
[Step-by-step user flows this module handles]

## Components
[List of UI components in this module]

## Hooks
[List of React hooks this module exports]

## API Routes
[List of Express routes this module adds]

## Error States
[All the ways this module can fail, and how it handles each]

## Tests Required
[List of test cases that must pass before this module is done]
```

---

## Module Isolation Rule

Each module lives in `src/modules/<module-name>/` and exports only through `src/modules/<module-name>/index.ts`. No other module may import from a module's internal files.

```
src/modules/
  properties/
    index.ts          ← public API (the only import point)
    types.ts          ← TypeScript types
    utils/            ← pure utility functions
    hooks/            ← React hooks
    components/       ← React components (module-specific)
    api.ts            ← API layer (React Query hooks)
```
