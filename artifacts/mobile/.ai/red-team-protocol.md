# ViewState App — Red-Team / Grill-Me Protocol

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Purpose

Before any layer is locked and implementation begins, the Founder runs a red-team session to stress-test the plan. This forces the AI to argue against its own proposals, find weaknesses, and surface risks the Founder might have missed.

---

## When to Run a Red-Team Session

- Before implementing any new layer (Foundation, Property Module, Matching Engine, etc.)
- After a major architecture decision
- Before any external integration (auth provider, storage provider, etc.)
- When the Founder says: **"GRILL ME"** or **"RED TEAM: [topic]"**

---

## Red-Team Session Format

When the Founder says `GRILL ME` or `RED TEAM: [topic]`, the AI must:

1. **Switch to adversarial mode** — argue against the current plan
2. **Find at least 5 weaknesses** in the plan/design/decision
3. **Assign a risk level** to each: 🔴 High / 🟡 Medium / 🟢 Low
4. **Propose a mitigation** for each High and Medium risk
5. **End with a verdict**: "Safe to proceed" or "Recommend rethinking [X] before proceeding"

---

## Sample Red-Team Questions (AI asks these itself)

### Architecture
- What happens when a broker has 500 properties and the matching engine runs on every login?
- What if the Arabic input contains characters that break our SQL queries?
- What if two brokers have the same phone number?
- What if the WhatsApp export format changes in the next WhatsApp update?
- What if the user's phone language is Arabic but their property data is in English?

### Data Model
- What if a buyer's requirements change while a match is pending?
- What if a property is deleted — what happens to its open matches?
- What if the broker changes the price — are old matches invalidated?
- What if two requirements match the same property — do we show duplicate matches?

### UX
- What happens if the user denies contacts permission?
- What if the user has 1000 contacts and the import takes 30 seconds?
- What if the user closes the app mid-WhatsApp import?
- What if the device language is Arabic but the app default is English?
- What happens if a form field is submitted with RTL + LTR mixed text?

### Security
- How is the broker's client list protected from other brokers?
- Can a buyer see other buyers' requirements?
- What stops a user from manually calling the API to create matches for other people's properties?
- What if someone registers with a phone number they don't own?

### Business
- What if a broker onboards but never adds a property?
- What if there are 100 properties and 0 requirements — how does the broker know why there are no matches?
- What if the matching engine creates a match that is obviously wrong?

---

## Red-Team Output Format

```markdown
## Red-Team: [topic] — [date]

### Risk 1: [Name]
Risk level: 🔴 High
Description: [what could go wrong]
Mitigation: [what to do about it]

### Risk 2: [Name]
Risk level: 🟡 Medium
...

### Verdict
[Safe to proceed / Recommend rethinking X]
```

---

## Obligation

The AI is **obligated** to be harsh in red-team mode. Sycophantic red-team sessions are useless. If the AI finds no risks, it has failed — every plan has at least 3 real risks.
