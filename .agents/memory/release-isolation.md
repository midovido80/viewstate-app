---
name: Release isolation
description: User-confirmed boundary between isolated source changes, reports, and device release builds.
---

Keep broker-workflow changes in an isolated branch/worktree while the original source branch remains untouched. Do not merge, push, or start an EAS APK build as an implicit part of implementing changes; first report the verification result and wait for a separate build decision.

**Why:** The user explicitly chose a separate branch and workspace to protect the referenced source version and requested a result report before installing a test APK.

**How to apply:** Verify the original working tree is clean, run checks against the isolated worktree, distinguish source checks from evidence on the installed Android release, and request an explicit go-ahead before building or distributing an APK.