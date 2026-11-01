---
name: Requirement save evidence boundary
description: How to judge a prior failed mobile save when a fresh preview succeeds but the original exception and storage are unavailable.
---

Treat a controlled save in a fresh browser context as proof only for that browser, adapter and source. Do not declare an earlier failed save fixed or infer its original exception from success elsewhere. If the original exception was never captured and cannot be recovered, classify its historical root cause as unrecoverable. A product milestone may still pass on its independently specified current-contract gates; the missing historical exception alone need not block it. A rejected write can be ambiguous; check its exact ID in the same active store before allowing another attempt.

**Why:** The founder reported a failed Requirement save with only a generic error and no visible record. The failed platform was later confirmed as the Replit Expo browser preview, but no original exception or log exists. A separate successful controlled web run cannot explain the earlier failure, yet the founder explicitly allowed completion based on a complete, evidence-backed current save contract.

**How to apply:** For future save failures, correlate a privacy-safe stage/error code, build/runtime platform, generated ID and exact-ID storage result from the affected instance. Preserve entered values and avoid speculative adapter changes or retrying an uncertain write. Do not manufacture unavailable historical evidence; verify every current gate, including actual runtime adapter and exact-ID read-back, before moving to downstream work.