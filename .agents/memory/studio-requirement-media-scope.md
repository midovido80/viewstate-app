---
name: Wanted Requirement boundary
description: Why Wanted records must not acquire exact Property location or media, and how to handle older local rows.
---

Wanted Requirements, including Studio, describe seeker preferences: preferred areas, specifications, budget, cadence, and notes. Exact Google Maps locations and Property attachments belong only to Offered Properties. Do not reuse Property-media persistence to save a Requirement.

**Why:** The founder clarified that a Wanted record is a real Requirement rather than a Property listing. Earlier Studio work temporarily accepted Property map links and local media on Requirements; this was the wrong domain boundary and complicated a real save failure.

**How to apply:** New Requirement candidates must never collect or persist exact locations or attachments. Older local rows that contain those legacy fields should remain readable without rewriting stored bytes or deleting files on hydration; an explicit user edit can persist the corrected canonical Requirement. Keep the Property media path independent.