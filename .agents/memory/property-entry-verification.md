---
name: Property entry verification
description: Why property-form changes need role-correct end-to-end checks from every entry point.
---

Verify Home-origin and Person-origin Offered Studio separately, then verify Person-origin Wanted Studio with a Seeker-classified Person.

**Why:** A shared route worked from Home while a separate Person-origin Offered action still entered a generic capture path and could not save Studio. A subsequent Wanted check used an Owner-only Person and could not attach a Seeker, which was the correct role boundary rather than a form failure.

**How to apply:** When changing catalog routing or Studio saves, exercise the actual Person action as well as Home, confirm the Person ID/source role survives through final save, and use a Seeker identity for Wanted Rent and Purchase. Do not infer final-save success from Save Draft or from selector/unit tests alone.