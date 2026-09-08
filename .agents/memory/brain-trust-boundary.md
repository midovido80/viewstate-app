---
name: Brain trust boundary
description: The durable authority boundary for ViewState Brain features.
---

Brain may convert Arabic or English requests into a validated, constrained intent, but it must never create records, IDs, permissions, eligibility, or scores. Search results come from the user's current local ViewState data, and match scores come only from the existing deterministic matching engine.

**Why:** This preserves privacy, prevents hallucinated business data, and keeps qualification and snapshot-consistency rules authoritative as AI capabilities expand.

**How to apply:** For every Brain feature, keep the flow as local Database/Domain → deterministic Matching Engine when applicable → AI-assisted explanation/action. Send only the minimum user request needed for intent extraction and validate every model response before local dispatch.

Internal EAS Android builds must receive `EXPO_PUBLIC_DOMAIN` through the EAS `preview` environment; Replit workflow variables are not automatically available on EAS workers.

**Why:** Without that build-time public domain, on-device recording may succeed locally but transcription fails before reaching the Brain API.

**How to apply:** Before starting an internal APK build, verify the EAS `preview` environment contains the current project API domain. Keep the value outside source code and never replace it with a hardcoded hostname.