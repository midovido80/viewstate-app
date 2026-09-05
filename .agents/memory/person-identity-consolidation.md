---
name: Person identity consolidation
description: Durable safety rules for treating one phone identity as one multi-role Person.
---

Treat a canonical normalized phone as one Person identity whose classifications are enriched by union. When legacy duplicates are consolidated, keep a deterministic stable survivor and repoint all valid links, sources, and requirements before removing duplicates.

**Why:** A role difference must never create a second identity, while existing relationship data and user-authored person fields must remain intact.

**How to apply:** Any create, edit, or contact-import path that encounters an existing canonical phone must enrich or safely consolidate that Person. If any involved persisted record is unreadable or dangling, fail closed before writes rather than risk changing opaque bytes or losing relationships.