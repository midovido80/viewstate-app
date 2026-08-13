# ViewState App — AI Workflow

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## How AI Is Used in This Project

AI is a **precision tool**, not an autonomous developer. Every AI session has a specific bounded task. The AI does not design the product — it executes tasks the Founder has already designed.

---

## Session Start Protocol (required every session)

Before writing any code, the AI must:

1. Read `artifacts/mobile/.ai/GOVERNANCE.md`
2. Read `artifacts/mobile/.ai/current-state.md`
3. Read the relevant skill file(s) for the task (e.g., `.ai/skills/properties.md`)
4. Confirm understanding by stating:
   - Current project state (from `current-state.md`)
   - The exact task being executed
   - The boundaries that must not be crossed
5. Ask ONE clarifying question if anything is ambiguous — then proceed

---

## Task Execution Protocol

When executing a task:

1. **Announce the plan** before writing code:
   ```
   PLAN:
   - Files to create: [list]
   - Files to modify: [list]
   - Files NOT touched: [list]
   - Governance boundaries respected: [list]
   ```

2. **Execute** — write files in parallel batches where possible

3. **Report** when done:
   ```
   DONE:
   - Created: [list of files]
   - Modified: [list of files]
   - current-state.md updated: yes/no
   - decisions-log.md updated: yes/no (if a decision was made)
   - Next step: [what the Founder should do next]
   ```

---

## Pause Protocol

The AI must **pause and ask** (not proceed autonomously) when:

- The task requires a file or module not yet in governance
- A new dependency is needed
- The task would require changing a governance document
- There is ambiguity in the scope that could lead to over-building
- A governance rule and a technical constraint conflict

Format for pausing:
```
PAUSE — Clarification needed:
[Question in plain language]
Options:
A) [option 1]
B) [option 2]
Recommendation: [A or B] because [reason]
```

---

## What AI May NOT Do

- Invent features not described in governance
- Change `.ai/` governance files without Founder approval
- Add npm packages without announcing them
- Remove or rename existing working code without being asked
- Implement more than the exact task requested
- Use placeholder or mock data in place of real implementations

---

## Skill File Usage

Before working on any module, the AI reads the relevant skill file. Skill files are in `.ai/skills/`. They contain:

- Exact implementation rules for that module
- Patterns the AI must follow
- Anti-patterns to avoid
- Code snippets that define the expected style

Skill files are **prescriptive** — the AI follows them, does not reinterpret them.

---

## AI Session Log Template

At the end of each session, add a log entry to `current-state.md`:

```
### Session: [date]
Task: [what was asked]
Completed: [what was done]
Files changed: [list]
Decisions logged: yes/no
Blockers: [any issues for Founder]
```

---

## Prohibited AI Phrases

The AI must never say:
- "I'll also add [unprompted feature]..."
- "I took the liberty of..."
- "While I'm at it..."
- "I added [thing you didn't ask for] to make it better"

These phrases signal scope creep. If the AI is tempted to say them, it must stop and ask the Founder instead.
