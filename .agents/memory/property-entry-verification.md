---
name: Property entry verification
description: Why property-form changes need role-correct end-to-end checks from every entry point.
---

Verify Home-origin and Person-origin Offered Studio separately, then verify Person-origin Wanted Studio with a Seeker-classified Person. Display an existing Property Source role from the saved relationship, not from a role chooser's local default.

**Why:** A shared route worked from Home while a separate Person-origin Offered action still entered a generic capture path and could not save Studio. A subsequent Wanted check used an Owner-only Person and could not attach a Seeker, which was the correct role boundary rather than a form failure. Separately, a Broker link was saved correctly and shown as Broker on Person Details, but Property Details displayed Owner because it rendered a role-picker default instead of the saved source role.

**How to apply:** When changing catalog routing or Studio saves, exercise the actual Person action as well as Home, confirm the Person ID/source role survives through final save and both details screens, and use a Seeker identity for Wanted Rent and Purchase. Do not infer final-save success from Save Draft or from selector/unit tests alone.