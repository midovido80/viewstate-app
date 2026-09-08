---
name: Mobile API origin contract
description: Release-safety rules for choosing and validating the mobile app's packaged API origin.
---

Mobile release builds must require an explicit, valid HTTPS API origin. If the preferred origin variable is present but invalid, resolution fails closed rather than falling back to a legacy value. A legacy development-domain fallback is only for the managed local development workflow, not release preflight.

**Why:** Silent fallback can package an APK against an unintended backend while configuration checks appear to pass.

**How to apply:** Keep runtime resolution and build-time verification aligned. Any preview, internal, or production package must supply the preferred public API-origin variable and fail before bundling when it is missing or malformed.