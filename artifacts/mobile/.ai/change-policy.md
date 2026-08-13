# ViewState App — Change Policy

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Guiding Principle

This project uses a **Founder-approval gate** at every layer boundary. The AI never decides what to build next. The Founder controls the build sequence.

---

## Change Categories

### Category A — Governance changes (highest risk)
Any change to `.ai/` files, including this one.

- Requires: Founder written approval in the chat session
- Process: Founder proposes change → AI shows diff → Founder confirms → AI applies
- Log: Every governance change is logged in `decisions-log.md`

### Category B — Architecture changes (high risk)
Changes to module boundaries, data models, API contracts, or tech stack decisions.

- Requires: Founder written approval
- Process: AI proposes in a "PROPOSAL:" message with rationale → Founder approves → AI implements
- Log: Logged in `decisions-log.md`

### Category C — Feature implementation (medium risk)
New screens, new API routes, new DB columns, new business logic.

- Requires: Layer unlock command: `IMPLEMENT: [layer name]`
- Process: Founder unlocks → AI reads governance + skill → implements bounded task → updates `current-state.md`
- Log: Updated in `current-state.md`

### Category D — Bug fixes and polish (low risk)
Fixing a broken existing feature, adjusting spacing, fixing a typo.

- Requires: Description of bug or issue from Founder
- Process: AI proposes fix → Founder confirms → AI implements
- Log: Not required unless it reveals an architecture issue

---

## Scope Freeze Rule

When the Founder says `IMPLEMENT: [layer]`, the scope is the governance document for that layer. The AI must not:

- Add features not described in governance
- Make UI decisions beyond what architecture.md specifies
- Create new DB tables beyond what database-rules.md defines

If the task reveals a gap in governance, the AI must **pause** and ask the Founder to fill the gap before continuing.

---

## Prohibited AI Behaviors

The AI must never:

- Autonomously decide to implement a new feature
- Add a dependency without Founder awareness
- Change `app.json` bundle identifiers or version numbers without being asked
- Skip writing to `current-state.md` after completing a layer
- Implement more than the exact task requested

---

## Branching (future — when git is used)

- `main` — production-ready code only
- `dev` — integration branch
- `feat/[layer-name]` — feature branches per layer
- AI commits go to `feat/` branches only

---

## Dependency Policy

- No new npm package may be added without Founder awareness
- Prefer packages already in the Expo Go compatible list
- Every new package must be documented in `current-state.md` with the reason for inclusion
- Never upgrade Expo SDK or React Native version without explicit Founder instruction
