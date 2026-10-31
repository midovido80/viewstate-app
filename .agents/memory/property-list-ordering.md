---
name: Property list ordering
description: Why Property ordering retains deterministic creation chronology until updated-order storage is explicitly authorized.
---

Keep the established deterministic creation order for the general Properties list unless an updated-order persistence change is authorized. A just-saved Property may be highlighted and temporarily placed first on arrival without rewriting global chronology.

**Why:** “Recently updated first” was offered as an example of a stable default, not an authorization for a storage migration. Reinterpreting a creation timestamp as an update timestamp would misstate existing data, while adding durable update chronology would cross the no-migration boundary of the Property experience work.

**How to apply:** If later work requires genuine latest-update ordering, obtain authorization for a compatible update timestamp and migration strategy; do not silently repurpose historical creation metadata or alter Matching order.