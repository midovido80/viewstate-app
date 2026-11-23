---
name: Incompatible property detail transitions
description: Approved policy for draft values that become incompatible after a Property Floor-use or Requirement property-type change.
---

Require explicit confirmation before removing populated incompatible draft values. Cancellation or dismissal retains the prior selection and all draft values. Confirmation removes only the listed incompatible values, preserves compatible and unrelated edits, and does not persist automatically; the existing explicit Save remains required.

**Why:** Silent clearing risks accidental data loss, while dormant storage would require a broader schema and consumer contract. The approved bounded policy preserves the current strict schema and gives the broker a clear choice.

**How to apply:** Use this for residential Floor to commercial Floor transitions and Amenities-supported Requirement types changing to unsupported types. Compute affected values from canonical applicability, treating false and zero as populated, and bind confirmation to record identity plus the relevant draft snapshot.