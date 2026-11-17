# ViewState App — Grill Me / Red-Team Protocol

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Purpose

Before any layer is locked and implementation begins, the Founder runs a red-team session to stress-test the plan. The AI argues against its own proposals, surfaces risks, and finds weaknesses the Founder may have missed. Sycophantic sessions are useless — the AI is obligated to be harsh.

---

## When to Run

- Before implementing any new layer
- After a major architecture or product decision
- Before any external integration (auth, storage, etc.)
- When the Founder says: **`GRILL ME`** or **`RED TEAM: [topic]`**

---

## Session Protocol

When the Founder says `GRILL ME` or `RED TEAM: [topic]`, the AI must:

1. Switch to adversarial mode — argue against the current plan
2. Find **at least 5 weaknesses** with risk levels: 🔴 High / 🟡 Medium / 🟢 Low
3. Propose a mitigation for every High and Medium risk
4. End with a verdict: **"Safe to proceed"** or **"Recommend rethinking [X] before proceeding"**

The AI is obligated to find real risks. If the AI finds fewer than 3 risks, it has failed.

---

## Standard Grill Questions (AI asks itself)

### V001 Scope
- What happens when the broker has 500 contacts and the matching engine runs on every property save?
- What if a buyer's requirements change the same day a match was made?
- What if the broker wants to mark a contact as both Buyer and Broker — how does the UI handle dual roles?
- Global Search on every screen — what happens when the search database grows to 10,000 records?
- WhatsApp changes their export format — how quickly can we adapt?

### Data Model
- What if a property is deleted while a match is pending — what happens to the match record?
- What if a contact is soft-deleted — do their open requirements persist? Are matches invalidated?
- What if two contacts have the same phone number imported from two different sources?
- The `roles` array allows `['buyer', 'broker']` — what UI constraints prevent invalid combinations?

### Architecture
- What if the Arabic input contains characters that break our SQL queries?
- What if the user switches language while a form is half-filled?
- What if `I18nManager.forceRTL()` triggers a reload while the user is mid-import?
- Global Search calls the API on every keystroke with a 300ms debounce — what happens when the network drops?

### UX / Rule Compliance
- Rule 15 (native back): what happens on Android when the user presses hardware back from a form with unsaved data?
- Rule 16 (unsaved changes): is the confirmation shown even when the user switches tabs (not just back)?
- Rule 14 (visual baseline): is there any screen where red headings could be confused with error states?
- Rule 13 (global search in every header): how does the search bar look on a screen with a long title?

### Security
- How is a broker's contact list protected from another broker?
- Can a broker construct an API call to see another broker's properties?
- What if someone registers with a phone number they don't own?
- Are unsaved WhatsApp import files deleted from device cache immediately after parsing?

---

## Output Format

```markdown
## Red-Team: [topic] — [date]

### Risk 1: [Name]
Risk level: 🔴 High
Description: [what could go wrong]
Mitigation: [what to do about it]

### Risk 2: [Name]
Risk level: 🟡 Medium
Description: ...
Mitigation: ...

### Risk 3: [Name]
Risk level: 🟢 Low
Description: ...
Note: [accept / monitor / address in V002]

### Verdict
[Safe to proceed / Recommend rethinking X before proceeding]
Conditions: [any conditions that must be met before proceeding]
```
