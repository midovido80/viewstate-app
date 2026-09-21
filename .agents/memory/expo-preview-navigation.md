---
name: Expo Preview navigation
description: How to verify stateful Expo routes when direct web deep links do not initialize the app normally.
---

For critical Expo browser verification, begin at the app root and follow the normal user navigation path. A direct deep link to a stateful route can render a blank page even when the root app and that route both work through in-app navigation.

**Why:** During Add Property verification, the Expo web root rendered normally and the Home action opened the complete flow, while loading the capture route directly produced a blank screen without a runtime error.

**How to apply:** Treat normal entry navigation as the acceptance path. Record a direct-link blank separately as a routing/preview issue unless the product explicitly requires deep-link support.