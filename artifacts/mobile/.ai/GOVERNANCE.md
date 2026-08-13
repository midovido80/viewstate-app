# ViewState App — Governance Package

**Project:** ViewState App  
**Status:** 🔴 PRE-IMPLEMENTATION — No product features may be built without explicit Founder approval  
**Language:** Bilingual Arabic / English (ar / en)  
**Platform:** React Native (Expo) — iOS primary, Android secondary  
**Last updated:** 2026-08-13

---

## What This Package Is

The Governance Package is the single source of truth that governs every decision, every AI session, and every line of code written for ViewState. It exists BEFORE any product implementation. All future agents, engineers, and collaborators must read and agree to this package before touching the project.

---

## Governance Files Index

| File | Purpose |
|------|---------|
| `vision.md` | Project vision, problem, personas, north-star metrics |
| `architecture.md` | Architecture boundaries, module map, layer rules |
| `ux-rules.md` | Bilingual UX, RTL/LTR, typography, spacing, accessibility |
| `database-rules.md` | Schema philosophy, naming conventions, migration rules |
| `change-policy.md` | How changes get approved, branching, scope freeze |
| `ai-workflow.md` | How to use AI in this project — session protocol |
| `testing-protocol.md` | What must be tested, how, when |
| `red-team-protocol.md` | Grill-me / adversarial review protocol |
| `decisions-log.md` | All major architectural and product decisions |
| `current-state.md` | Live tracker of what exists vs. what is planned |
| `skills/react-native.md` | AI skill: React Native rules for this project |
| `skills/expo-router.md` | AI skill: Expo Router rules for this project |
| `skills/typescript.md` | AI skill: TypeScript rules for this project |
| `skills/forms-keyboard.md` | AI skill: Forms and keyboard handling |
| `skills/contacts.md` | AI skill: Contacts integration |
| `skills/properties.md` | AI skill: Property data model |
| `skills/matching.md` | AI skill: Buyer-seller matching logic |
| `skills/media-storage.md` | AI skill: Media upload and object storage |
| `skills/whatsapp-import.md` | AI skill: WhatsApp chat import flow |
| `skills/database.md` | AI skill: Database schema and query rules |
| `skills/testing.md` | AI skill: Testing patterns |
| `skills/debugging.md` | AI skill: Debugging protocol |

---

## Hard Rules (Non-Negotiable)

1. **PRE-IMPLEMENTATION LOCK:** No screens, no business logic, no database schema, no API routes may be created until the Founder explicitly unlocks a layer by saying "IMPLEMENT: [layer name]".
2. **Governance-first:** Any AI session must begin by reading this file and the relevant skill file(s) before touching any code.
3. **Bilingual by design:** Every user-facing string must have both `ar` and `en` versions from day one. No hardcoded English-only text.
4. **No autonomous feature decisions:** AI must not decide what to build. It executes a specific, bounded task approved by the Founder.
5. **Document before implement:** Every new module must have its governance doc written and approved before its first line of code.
6. **Change policy respected:** All changes go through the process in `change-policy.md`.

---

## Implementation Unlock Protocol

When the Founder is ready to build a layer, they say exactly:

```
IMPLEMENT: [layer name]
Read: .ai/skills/[relevant-skill].md
Task: [specific bounded task]
```

The AI must:
1. Re-read `GOVERNANCE.md` and the named skill file
2. Confirm understanding of boundaries
3. Execute only the named task
4. Update `current-state.md` when done
5. Log any decisions in `decisions-log.md`

---

## Project State Summary

```
ViewState App
├── Governance Package   ✅ COMPLETE
├── App Scaffold         ✅ (Expo blank scaffold — no product UI)
├── Database Schema      ❌ NOT STARTED
├── API Routes           ❌ NOT STARTED
├── Auth Layer           ❌ NOT STARTED
├── Property Module      ❌ NOT STARTED
├── Contacts Module      ❌ NOT STARTED
├── Matching Engine      ❌ NOT STARTED
├── WhatsApp Import      ❌ NOT STARTED
├── Media/Storage        ❌ NOT STARTED
└── UI / Screens         ❌ NOT STARTED
```
