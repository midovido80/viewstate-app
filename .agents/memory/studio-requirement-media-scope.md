---
name: Studio Requirement media scope
description: Persistence boundary for Wanted Studio attachment metadata and blobs.
---

Wanted Studio attachments use the app's local Requirement persistence and owner-scoped managed files or browser blobs. Treat saved metadata as durable on the same device/browser, not as a cross-device upload or server-backed document.

**Why:** The current API has no Requirement blob authority or upload endpoint. Persisting local managed URIs does not make their bytes accessible from another device; claiming otherwise risks invisible broken media.

**How to apply:** Preserve attachment identity, ordering, cover and managed URI on local create/edit/readback; delete replaced files only after a confirmed exact-ID save. If cross-device access is later requested, design a separate authenticated upload/ownership and migration path instead of repurposing local URIs.