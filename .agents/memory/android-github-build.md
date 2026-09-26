---
name: Android test APK through GitHub Actions
description: GitHub Actions constraints discovered when building the isolated Expo Android test package.
---

An experimental branch can reuse a dispatchable workflow that already exists on the default branch; adding a new workflow only on the experimental branch cannot be manually dispatched there until its file exists on the default branch.

**Why:** GitHub gates workflow_dispatch availability on the default-branch workflow file. Keeping the APK job restricted to manual dispatch on the test branch avoids modifying or triggering the main branch.

**How to apply:** Extend the existing manual workflow for isolated APK attempts. GitHub-hosted Ubuntu runners already include Android SDK; the older setup-android action attempted to install a removed `tools` package and failed before compilation. Prefer validating the hosted SDK, and run an Android JavaScript export before expensive Gradle compilation to catch missing direct build dependencies early.