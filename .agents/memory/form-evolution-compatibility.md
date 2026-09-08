---
name: Form evolution compatibility
description: How to evolve type-specific forms without silently deleting valid legacy fields.
---

When a newer type-specific form intentionally hides fields that older versions allowed, a normal edit must preserve those valid hidden values. Drop them only when the user deliberately changes the purpose, type, subtype, or other discriminator that made the old values applicable.

**Why:** Tightening form applicability can otherwise turn an unrelated notes or budget edit into silent data loss and can change downstream behavior.

**How to apply:** Audit existing persisted shapes before narrowing a form. Keep old records readable, retain hidden values across compatible edits, prevent new records from creating them, and add round-trip tests for both preservation and intentional discriminator changes.