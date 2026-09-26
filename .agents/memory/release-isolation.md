---
name: Release isolation
description: User-confirmed boundary between isolated source changes, reports, and device release builds.
---

Keep broker-workflow changes in an isolated branch/worktree while the original source branch remains untouched. A report must precede a separate build decision. The user subsequently authorized pushing only the test branch to build an APK; this is not permission to merge or replace the source version.

**Why:** The user explicitly chose a separate branch and workspace to protect the referenced source version and wants to test the APK before deciding whether to adopt the branch.

**How to apply:** Verify the original working tree is clean, run checks against the isolated worktree, distinguish source checks from evidence on the installed Android release, and wait for approval before merging. A debug-signed test APK with the same package ID may not install over a differently signed existing app; never advise uninstalling before protecting on-device data.