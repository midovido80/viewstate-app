---
name: Expo Preview screenshot timing
description: How to interpret a blank Expo web Preview capture when the bundle has loaded.
---

An initial Expo web Preview screenshot can be blank even when the live route and accessibility tree have rendered.

**Why:** During mobile Preview verification, the bundle started without runtime errors but an early screenshot was white; a later direct-route capture rendered correctly and browser interaction verified both languages.

**How to apply:** Before diagnosing a blank capture as an app regression, inspect workflow/browser logs, capture the specific route again, and compare the accessibility snapshot. Do not count the flow as visually verified until visible evidence succeeds.