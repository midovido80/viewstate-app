# ViewState App — Governance Package

**Project:** ViewState App  
**Status:** 🟡 BOUNDED LOCAL IMPLEMENTATION — Further product stages require explicit Founder approval; see `CURRENT_STATE.md`
**Stage 00.1:** 🔒 FROZEN / APPROVED (2026-08-13) — see `STAGE_00_1_FREEZE.md` and DEC-014  
**Stage 00.2.1:** 🔒 FROZEN / APPROVED (2026-08-13) — see `STAGE_00_2_1_FREEZE.md` and DEC-017  
**Stage 00.2.2:** 🔒 FROZEN / APPROVED (2026-08-13) — see `STAGE_00_2_2_FREEZE.md` and DEC-021  
**Stage 00.3:** 🔒 FROZEN / APPROVED (2026-08-13) — see `STAGE_00_3_FREEZE.md` and DEC-026  
**Stage 00.2.3:** Historical placeholder only — no active required stage
**Stage 00.4:** 🔒 HISTORICALLY FROZEN
**Stage 00.5:** NOT DEFINED
**Governance Reconciliation:** 🔒 FROZEN — corrective reconciliation verified on GitHub `main` at `fbed357dabf09799c73982bb0643673ef3337a05`; PR #2 merged normally
**Stage 01:** PARTIALLY IMPLEMENTED / NOT FROZEN — Current bounded scope and remaining locks are recorded in `CURRENT_STATE.md`
**Language:** Bilingual Arabic / English (ar / en)  
**Platform:** React Native + Expo — Android-first rollout and pilot; iOS architectural compatibility maintained continuously
**Last updated:** 2026-08-31

---

## Current Effective V001 Contract

The approved future Stage 01 title is **Property Capture Architecture & Dynamic Form Impact Analysis (Sale & Rent — Built Properties; Land Workflow Separate)**. Stage 01 is now partially implemented and not frozen as recorded in `CURRENT_STATE.md`; this does not unlock any remaining stage or module. Land remains a separately analyzed, approved, and frozen later V001 workflow.

- ViewState App is one Android/iOS product. Android is first for rollout and pilot validation; iOS architectural compatibility is continuous. Expo Go is a preview/testing option, not an exclusive dependency gate; every dependency requires Android, iOS, and Expo compatibility review.
- The exact Person classifications are Seeker / باحث, Owner / مالك, Broker / دلال, Real Estate Company / شركة عقارية, and Building Guard / حارس. Requirements are separate Seeker-owned records; their purpose is Rent or Buy, and a Seeker may have multiple Requirements.
- UI and system-authored content are localized in Arabic and English. User-entered or imported names, notes, descriptions, and source text remain literal and are not automatically translated or duplicated.
- The minimum Tasks and Follow-ups capability is in scope. Its four separate optional labels are Follow Up, Important, Pending, and Order Complete / Closed Deal.
- Property workflow is property-first with separate Rental Price and Sale Price, Draft-first Property Import, one-Property-at-a-time Safe Share, PACI/Location/Maps behavior, private-by-default disclosure, and no-silent-loss Draft recovery.

### Current Runtime and Persistence Precedence

For current implementation status and persistence operations, `CURRENT_STATE.md` and its **Persistence Authority Boundary** control over older PRE-IMPLEMENTATION, “no implemented dataset,” or conditional “if data is discovered” wording retained in historical reconciliation and freeze records.

- The implemented mobile app has a known local SQLite/AsyncStorage dataset governed by shared mobile domain validation/contracts.
- PostgreSQL/Drizzle remains future server-side architecture and is not the current mobile runtime schema authority.
- Any future server schema or synchronization work must first establish a separately approved compatibility, mapping, and migration boundary for the known local dataset; it must not silently remap or discard data.
- Foundation Fix 01 remains frozen and unchanged. Foundation Fix 02 is documentation-only, passed Founder/CTO review, and is now FROZEN. Matching has not started.

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
| `GOVERNANCE_RECONCILIATION_FREEZE.md` | 🔒 FROZEN formal reconciliation freeze record |
| `PRE_STAGE_01_PROPERTY_CAPTURE_SCOPE_AMENDMENT_FREEZE.md` | 🔒 FROZEN scope-amendment freeze record; Stage 01 analysis remains separately Founder-authorized |
| `skills/README.md` | Skills index — task-specific AI rules per module |

---

## The 18 Mandatory Governance Rules

These rules are non-negotiable and apply to every AI session and every implementation stage.

### Implementation Control
1. **IMPLEMENTATION GATE.** Existing bounded local implementation does not authorize further features or stages. No additional feature implementation may begin without explicit Founder approval.
2. **Founder approval gate.** No feature, screen, dependency, or architecture change may be made without explicit Founder sign-off.
3. **One layer at a time.** Build one layer at a time. Do not mix unrelated layers in a single session.
4. **No inventing.** Replit must not invent requirements, fields, workflows, dependencies, architecture changes, or UX behavior not defined in governance.
5. **Ambiguity = STOP.** If any requirement is ambiguous, conflicting, or requires a change outside the approved scope, STOP and ask before implementing.
6. **Frozen layers are locked.** Frozen layers must never be changed without explicit Founder approval.

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

### Stage Protocol
7. **Every implementation stage must define:** scope, allowed changes, forbidden changes, testing requirements, new-user simulation, regression boundary, stop conditions, and final report. This definition must exist before any code is written.
8. **Testing before reporting.** After each completed layer: run technical tests, functional tests, new-user simulation, and regression checks before reporting completion.

### V001 Product Scope
9. **V001 scope is fixed and lean.** V001 includes Contacts, Properties, Seeker Requirements, Matching, the separate 4-label optional classification capability, minimum Tasks and Follow-ups, Draft-first Property Import, Safe Share, operating-system share sources, Global Search, User Profile, and Arabic/English support. **Deferred (not V001):** recurring or automated task systems, Deals tracking, Commission, Reports, Network Marketplace, advanced AI chat, voice assistant, full-account portability, ViewState Card, and direct ViewState-to-ViewState sharing.
10. **Capture First → Enrich Later.** Minimal required data first; optional details later. Do not over-engineer forms or data models on first entry.
11. **Person classifications for V001:** Seeker / باحث, Owner / مالك, Broker / دلال, Real Estate Company / شركة عقارية, and Building Guard / حارس — exactly these five. Person capture is role-first; at least one classification is required before final save; multi-role support is required.
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

An IMPLEMENT command is valid only after the mandatory governance lifecycle above. It may not bypass CTO Review, Impact Analysis, or Founder Approval.

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
