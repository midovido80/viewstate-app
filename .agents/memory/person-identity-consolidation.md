---
name: Person identity consolidation
description: Durable safety rules for treating one phone identity as one multi-role Person.
---

Treat a canonical normalized phone as one Person identity whose classifications are enriched by union. When legacy duplicates are consolidated, keep a deterministic stable survivor and repoint all valid links, sources, and requirements before removing duplicates.

Every valid Person classification may own property Requirements. The legacy `seekerId` field names the owning Person for compatibility; it must not be used to require a Seeker classification.

**Why:** A role difference must never create a second identity, while existing relationship data and user-authored person fields must remain intact. Brokers, real-estate companies, and other contacts can request properties without becoming duplicate Seeker records.

**How to apply:** Any create, edit, or contact-import path that encounters an existing canonical phone must enrich or safely consolidate that Person. Requirement ownership should verify Person existence, not a particular classification. If any involved persisted record is unreadable or dangling, fail closed before writes rather than risk changing opaque bytes or losing relationships.