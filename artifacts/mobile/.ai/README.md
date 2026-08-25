# ViewState App — Governance Package

**Project:** ViewState App  
**Status:** 🔴 PRE-IMPLEMENTATION — No product features may be built without explicit Founder approval  
**Stage 00.1:** 🔒 FROZEN / APPROVED (2026-08-13) — see `STAGE_00_1_FREEZE.md` and DEC-014  
**Stage 00.2.1:** 🔒 FROZEN / APPROVED (2026-08-13) — see `STAGE_00_2_1_FREEZE.md` and DEC-017  
**Stage 00.2.2:** 🔒 FROZEN / APPROVED (2026-08-13) — see `STAGE_00_2_2_FREEZE.md` and DEC-021  
**Stage 00.3:** 🔒 FROZEN / APPROVED (2026-08-13) — see `STAGE_00_3_FREEZE.md` and DEC-026  
**Stage 00.2.3 placeholder:** ⚠️ label exists in files — content undefined; deferred to Governance Cleanup Pass  
**Language:** Bilingual Arabic / English (ar / en)  
**Platform:** React Native (Expo) — iOS primary, Android secondary  
**Last updated:** 2026-08-13

---

## What This Package Is

The Governance Package is the **single source of truth** that governs every decision, every AI session, and every line of code written for ViewState. It is established BEFORE any product implementation. All future agents, engineers, and collaborators must read and agree to this package before touching the project.

---

## Governance Files Index

| File | Purpose |
|------|---------|
| `README.md` | **This file** — master index, hard rules, all 18 governance rules |
| `PROJECT_BIBLE.md` | Vision, V001 product scope, personas, principles |
| `ARCHITECTURE.md` | Architecture boundaries, module map, layer build order |
| `UX_RULES.md` | Bilingual UX, RTL/LTR, visual baseline, navigation rules |
| `DATABASE_RULES.md` | Schema philosophy, naming conventions, migration rules |
| `CHANGE_POLICY.md` | How changes get approved, stage definitions, scope freeze |
| `AI_WORKFLOW.md` | How to use AI in this project — session protocol, prompt rules |
| `TESTING.md` | What must be tested, how, when, acceptance criteria |
| `GRILL_ME.md` | Adversarial red-team / grill-me review protocol |
| `DECISIONS.md` | All major architectural and product decisions |
| `CURRENT_STATE.md` | Live tracker of what exists vs. what is planned |
| `skills/README.md` | Skills index — task-specific AI rules per module |

---

## The 18 Mandatory Governance Rules

These rules are non-negotiable and apply to every AI session and every implementation stage.

### Implementation Control
1. **PRE-IMPLEMENTATION LOCK.** The project remains PRE-IMPLEMENTATION. No feature implementation may begin without explicit Founder approval.
2. **Founder approval gate.** No feature, screen, dependency, or architecture change may be made without explicit Founder sign-off.
3. **One layer at a time.** Build one layer at a time. Do not mix unrelated layers in a single session.
4. **No inventing.** Replit must not invent requirements, fields, workflows, dependencies, architecture changes, or UX behavior not defined in governance.
5. **Ambiguity = STOP.** If any requirement is ambiguous, conflicting, or requires a change outside the approved scope, STOP and ask before implementing.
6. **Frozen layers are locked.** Frozen layers must never be changed without explicit Founder approval.

### Stage Protocol
7. **Every implementation stage must define:** scope, allowed changes, forbidden changes, testing requirements, new-user simulation, regression boundary, stop conditions, and final report. This definition must exist before any code is written.
8. **Testing before reporting.** After each completed layer: run technical tests, functional tests, new-user simulation, and regression checks before reporting completion.

### V001 Product Scope
9. **V001 scope is fixed and lean.** V001 features: Contacts, Properties, Requirements, Matching, Classification (4-label optional status tags), Import/WhatsApp+WhatsApp Business communication, Global Search, User Profile, Arabic/English support. **Deferred (not V001):** Full task/reminder engine, Deals tracking, Commission, Reports, Network Marketplace, advanced AI chat, voice assistant.
10. **Capture First → Enrich Later.** Minimal required data first; optional details later. Do not over-engineer forms or data models on first entry.
11. **Contact roles for V001:** Tenant, Buyer, Owner, Broker — only these four. No other contact roles.
12. **Matching AI scope for V001:** Compare + Score + Explain — only these three capabilities. No recommendation engine, no ML, no vector search.

### UX Rules
13. **Global Search is a core V001 utility** and must be available from every primary screen in the approved UX direction.
14. **Visual baseline for V001:** blue top header, global search in the header on every primary screen, white/light background, red for primary headings/key data, blue for action buttons and Quick Add, green for WhatsApp and Call actions, minimal colors elsewhere.
15. **Navigation back must respect device/native system behavior.** Do not invent a custom back gesture that conflicts with Android device behavior.
16. **Unsaved changes must be protected** by a simple confirmation dialog before leaving any form screen.

### Architecture
17. **Future-ready architecture.** Future platform integration, broader AI Brain capabilities, and network features must be architecture-ready but not implemented in V001.

### Prompt Execution
18. **Prompt execution rules are mandatory.** Every implementation prompt must be treated as a structured command with explicit: TASK, OBJECTIVE, REQUIRED BEHAVIOR, ALLOWED CHANGES, FORBIDDEN CHANGES, SCOPE, TESTING, STOP CONDITIONS, and FINAL REPORT. Do not reinterpret a task as a broad product brief.

---

## Implementation Unlock Protocol

When the Founder is ready to build a layer, they say exactly:

```
IMPLEMENT: [layer name]
Read: .ai/skills/[relevant-skill].md
Task: [specific bounded task]
```

The AI must:
1. Re-read `README.md` and the named skill file
2. Confirm understanding of the exact task and boundaries (Rule 7 stage definition)
3. Execute only the named task
4. Run tests and verify (Rule 8)
5. Update `CURRENT_STATE.md`
6. Log decisions in `DECISIONS.md`
7. Report completion per Rule 7 Final Report format

---

## Project State Summary

```
ViewState App
├── Governance Package   ✅ COMPLETE (corrected to approved naming)
├── App Scaffold         ✅ (Expo blank scaffold — no product UI)
├── Foundation / Auth    🔒 LOCKED
├── Property Module      🔒 LOCKED
├── Contacts Module      🔒 LOCKED
├── Requirements Module  🔒 LOCKED
├── Matching Engine      🔒 LOCKED
├── WhatsApp Import      🔒 LOCKED
├── Media/Storage        🔒 LOCKED
└── UI / Screens         🔒 LOCKED
```


---

## Governance Reconciliation — Effective Rules

This addendum is authoritative for future implementation after the approved governance reconciliation. Historical Stage 00.1–00.4 wording and prior decisions remain preserved as historical evidence; where a conflict exists, the later append-only reconciliation decisions control.

- Status remains PRE-IMPLEMENTATION.
- Stage 00.5 is not defined and must not be fabricated.
- Stage 01 has not begun.
- Product implementation remains unauthorized until a bounded Stage 01 Impact Analysis is approved.
- No database migration is authorized or required by this reconciliation.
- Any role, price, Draft, or compatibility migration reference is a future schema/compatibility risk only.
- If an implemented dataset is discovered before future schema work, the relevant stage must stop for a fresh compatibility and migration assessment.
- ViewState App is one Android/iOS product. Android-first is rollout priority only; iOS architectural compatibility is continuous.
- Simplicity and Speed, Capture First → Enrich Later, Private by default, Explicit sharing, and No silent loss remain mandatory.


## Governance Reconciliation — Current Authoritative Contract

### Product status and sequencing

ViewState App V001 remains PRE-IMPLEMENTATION. Stage 00.5 is not defined. Stage 01 has not started. Product implementation remains locked until a bounded Stage 01 Property Workflow Impact Analysis receives Founder approval.

### Person model

The five Person classifications are Seeker / باحث, Owner / مالك, Broker / دلال, Real Estate Company / شركة عقارية, and Building Guard / حارس. Tenant and Buyer are historical role values superseded for future implementation. A Seeker may own multiple separate Requirements, whose purpose is Rent or Buy. Person capture is role-first and requires at least one classification before final save.

### V001 scope corrections

The minimum Tasks and Follow-ups capability and Property Import/Safe Share are included within their approved boundaries. Full-account portability, ViewState Card, and direct ViewState-to-ViewState sharing remain separate later capabilities. Platform, Network, Marketplace, and Commission Management remain outside V001 implementation scope.

### Cross-platform contract

Android is first for rollout and pilot validation, not an Android-only architecture. iOS compatibility is maintained continuously. Shared business rules, persistence, APIs, migrations, privacy, backup, import/export, and future Card formats remain platform-neutral and native functions use replaceable adapters.

### Visual and interaction invariants

Light background; blue header; fixed Global Search in the header of principal screens; red primary headings and important data; blue action buttons; green WhatsApp and Call actions; Arabic/RTL and English/LTR; native platform back behavior; and keyboard-safe forms remain authoritative.