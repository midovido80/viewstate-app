# ViewState — AI Skills Index

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## What Are Skills?

Skill files are task-specific AI rules for each module of ViewState. Before writing any code for a module, the AI **must** read the relevant skill file. Skills are prescriptive — the AI follows them, does not reinterpret them.

Skills are read by the AI at the start of each implementation session. They define:
- Exact patterns the AI must follow
- Anti-patterns to avoid
- Code snippets that define expected style
- Module-specific rules that narrow down the general governance

---

## Skills Index

| Skill File | When to Read |
|-----------|-------------|
| `react-native.md` | Before writing any React Native component code |
| `expo-router.md` | Before creating or modifying navigation/routing |
| `typescript.md` | Before writing any TypeScript in this project |
| `forms-keyboard.md` | Before implementing any form or keyboard interaction |
| `contacts.md` | Before implementing the Contacts module |
| `properties.md` | Before implementing the Properties module |
| `matching.md` | Before implementing the Matching Engine |
| `media-storage.md` | Before implementing photo upload or media features |
| `whatsapp-import.md` | Before implementing the WhatsApp Import flow |
| `database.md` | Before writing any Drizzle schema, migration, or query |
| `testing.md` | Before writing any test file |
| `debugging.md` | Before debugging any issue |

---

## V001 Critical Skill Reminders

### Contacts (contacts.md)
> Rule 11: V001 contact roles are **Tenant, Buyer, Owner, Broker** — only these four. No others.

### Matching (matching.md)
> Rule 12: V001 matching scope is **Compare + Score + Explain** — only these three capabilities.

### All modules
> Rule 10: Capture First → Enrich Later. Minimal required fields on first entry. Optional details accessible via Edit.

### All UI (react-native.md + expo-router.md)
> Rule 13: Global Search appears in the blue header on every primary screen.  
> Rule 14: Visual baseline — blue header, red headings, blue actions, green for WhatsApp/Call.  
> Rule 15: Never override native back navigation behavior.  
> Rule 16: Always protect unsaved changes with a confirmation dialog.

---

## Skill File Update Policy

Skill files may only be updated when:
1. The Founder explicitly approves a change to a skill rule
2. A governance correction session is authorized (like this one)

Skill files are **locked** once a layer that depends on them is in COMPLETE status. Changing a skill for a completed layer requires a Founder-approved regression pass.
