---
name: Requirement save evidence boundary
description: How to judge a prior failed mobile save when a fresh preview succeeds but the original exception and storage are unavailable.
---

Treat a controlled save in a fresh browser context as proof only for that browser, adapter and source. Do not declare an earlier failed save fixed, freeze a product milestone, or infer its original exception from success elsewhere. A rejected write can be ambiguous; check its exact ID in the same active store before allowing another attempt.

**Why:** The founder reported a failed Requirement save with a generic error and no visible record. A later isolated Expo web run with the same displayed values saved successfully, while the failed session's platform, original exception and storage identity could not be established. A clean reproduction does not explain the original failure.

**How to apply:** For future save failures, correlate a privacy-safe stage/error code, build/runtime platform, generated ID and exact-ID storage result from the affected instance. Preserve entered values and avoid speculative adapter changes or retrying an uncertain write. Keep downstream phase gates closed until their stated evidence and verification requirements pass.