# ViewState App — AI Workflow

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## How AI Is Used in This Project

AI is a **precision execution tool**, not an autonomous developer. Every AI session has a specific bounded task. The AI does not design the product — it executes tasks the Founder has already designed and approved.

---

## Session Start Protocol (required every session)

Before writing any code, the AI must:

1. Read `artifacts/mobile/.ai/README.md` (the 18 rules)
2. Read `artifacts/mobile/.ai/CURRENT_STATE.md`
3. Read the relevant skill file(s) for the task
4. Confirm understanding by stating:
   - Current project state (from `CURRENT_STATE.md`)
   - The exact task being executed
   - The boundaries that must not be crossed
   - The Stage Definition (Rule 7) — before any code

---

## Prompt Execution Rules (Governance Rule 18)

**Every implementation prompt must be treated as a structured command.** Do not reinterpret a task as a broad product brief. Each prompt defines:

| Field | Meaning |
|-------|---------|
| **TASK** | The specific, bounded task name |
| **OBJECTIVE** | What the task achieves (one sentence) |
| **REQUIRED BEHAVIOR** | Exact behavior that must be implemented |
| **ALLOWED CHANGES** | Files and modules that may change |
| **FORBIDDEN CHANGES** | Explicit list of what must NOT change |
| **SCOPE** | The exact boundary of this task |
| **TESTING** | What tests must pass before completion |
| **STOP CONDITIONS** | What would cause the AI to stop and ask |
| **FINAL REPORT** | What the completion report must contain |

If any of these fields is missing from a prompt, the AI must ask the Founder to fill them before proceeding.

---

## No Inventing (Governance Rule 4)

The AI must never invent:
- Requirements not stated in governance
- Data fields not defined in `DATABASE_RULES.md`
- Workflows not described in a module's skill file
- Dependencies not approved by the Founder
- Architecture changes not in `ARCHITECTURE.md`
- UX behavior not in `UX_RULES.md`

If the AI believes something is needed but is not in governance, it must **STOP and ask** (Rule 5).

---

## Ambiguity = STOP (Governance Rule 5)

The AI must STOP and ask when:
- Any requirement is ambiguous or conflicting
- The task would require a change outside the approved scope
- A new dependency appears necessary
- A governance rule and a technical constraint conflict
- The task reveals a gap in governance
- Any approved governance filename would need to change

Format for pausing:
```
STOP — Clarification needed:
[Specific question]

Options:
A) [option]
B) [option]

Recommendation: [A or B] — because [reason]

I will not proceed until the Founder responds.
```

---

## Task Execution Protocol

When executing a task, the AI must follow this sequence:

**Step 1 — Stage Definition (Rule 7)**
Present the full Stage Definition and wait for Founder approval before writing code.

**Step 2 — Plan announcement**
```
PLAN:
Files to create: [list]
Files to modify: [list]
Files NOT touched: [list]
Governance rules applied: [list]
```

**Step 3 — Execute**
Write files in parallel batches. Follow the approved Stage Definition exactly.

**Step 4 — Completion Protocol (Rule 8)**
Run all required tests, simulations, and regression checks.

**Step 5 — Final Report**
```
DONE:
Created: [list]
Modified: [list]
Tests passed: [list]
New-user simulation: [result]
Regression: [result]
CURRENT_STATE.md updated: yes
DECISIONS.md updated: yes/no
Next step: [what the Founder should do next]
```

---

## Prohibited AI Phrases

The AI must never say:
- "I'll also add [unprompted feature]..."
- "I took the liberty of..."
- "While I'm at it..."
- "I added [thing] to make it better"
- "I assumed you wanted..."

These signal scope creep or Rule 4 violation. If the AI is tempted to say them, it must stop and ask instead.

---

## What AI May NOT Do (Summary)

- Invent features not in governance (Rule 4)
- Proceed when anything is ambiguous (Rule 5)
- Start coding without Stage Definition approval (Rule 7)
- Report completion without running tests (Rule 8)
- Build deferred features (Rule 9)
- Mix layers in one session (Rule 3)
- Change frozen layers (Rule 6)
- Add packages without announcement
- Remove or rename working governance files without Founder approval
