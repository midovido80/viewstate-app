# ViewState App — Change Policy

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Governing Principle

This project uses a **Founder-approval gate** at every layer boundary. The AI never decides what to build next. The Founder controls the build sequence. Frozen layers must never be changed without explicit Founder approval (Rule 6).

---

## Change Categories

### Category A — Governance changes (highest risk)
Any change to `.ai/` files, including this one.

- Requires: Founder written approval
- Process: Founder proposes change → AI shows exact diff → Founder confirms → AI applies
- Log: Logged in `DECISIONS.md`

### Category B — Architecture changes (high risk)
Changes to module boundaries, data models, API contracts, tech stack decisions.

- Requires: Founder written approval
- Process: AI proposes with rationale (PROPOSAL: format) → Founder approves → AI implements
- Log: Logged in `DECISIONS.md`

### Category C — Feature implementation (medium risk)
New screens, new API routes, new DB columns, new business logic.

- Requires: Layer unlock command: `IMPLEMENT: [layer name]`
- Requires: Stage definition before any code (Rule 7) — see Stage Protocol below
- Process: Founder unlocks → AI reads governance + skill → defines stage → implements → tests → reports
- Log: `CURRENT_STATE.md` updated

### Category D — Bug fixes and polish (low risk)
Fixing a broken existing feature, adjusting spacing, fixing a typo.

- Requires: Description of the bug from Founder
- Process: AI proposes exact fix → Founder confirms → AI implements
- Log: Not required unless it reveals an architecture issue

---

## Stage Protocol — Required for Every Implementation Layer (Rule 7)

Before writing any code for a new layer, the AI must define and present to the Founder:

```
STAGE DEFINITION: [Layer Name]

SCOPE:
  [Exact list of what will be built]

ALLOWED CHANGES:
  [Files and modules that may be modified]

FORBIDDEN CHANGES:
  [Explicit list of what must not change]

TESTING REQUIREMENTS:
  [What tests will be written and must pass]

NEW-USER SIMULATION:
  [How the AI will verify the feature works from a fresh user perspective]

REGRESSION BOUNDARY:
  [Which existing features must still work after this layer]

STOP CONDITIONS:
  [What would cause the AI to stop mid-layer and ask the Founder]

FINAL REPORT FORMAT:
  [What the completion report will contain]
```

The Founder must approve this definition before the AI writes a single line of code.

---

## Completion Protocol — Required After Every Layer (Rule 8)

After finishing any implementation layer, before reporting completion, the AI must:

1. ✅ Run technical tests (`pnpm typecheck`, unit tests)
2. ✅ Run functional tests (verify each feature in the stage scope works end-to-end)
3. ✅ Run new-user simulation (follow the flows as a first-time user would)
4. ✅ Run regression checks (verify that previously-working features still work)
5. ✅ Update `CURRENT_STATE.md`
6. ✅ Log any decisions made in `DECISIONS.md`
7. ✅ Deliver the Final Report

Only after all 7 steps are complete may the AI declare a layer done.

---

## Scope Freeze Rule

When the Founder says `IMPLEMENT: [layer]`, the scope is the governance document for that layer. The AI must not:

- Add features not described in governance
- Make UI decisions beyond what governance specifies
- Create DB tables beyond `DATABASE_RULES.md`
- Add any npm package without announcing it first
- Build anything from the deferred feature list (Rule 9)

If the task reveals a gap in governance, the AI must **STOP and ask** before continuing (Rule 5).

---

## One Layer at a Time (Rule 3)

- Do not mix unrelated layers in a single session
- Do not start a new layer until the previous one is fully reported and approved
- Do not begin Foundation before governance is approved
- Do not begin UI/Screens before all modules are working

---

## Dependency Policy

- No new npm package without Founder awareness
- Every new package documented in `CURRENT_STATE.md` with the reason
- Never upgrade Expo SDK or React Native without explicit Founder instruction (Expo Skill: Forbidden Changes)
- Prefer packages already in the Expo Go compatible list

---

## Prohibited AI Actions (always, without exception)

- Autonomously deciding to implement a new feature
- Inventing requirements, fields, workflows, or UX behavior (Rule 4)
- Implementing more than the exact task requested
- Adding deferred features from Rule 9 "out of scope" list
- Skipping the Stage Protocol (Rule 7) before implementing
- Skipping the Completion Protocol (Rule 8) before reporting done
- Changing `app.json` bundle identifiers without being asked
- Changing governance filenames without Founder approval
