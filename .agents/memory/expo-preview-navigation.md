---
name: Expo Preview verification
description: How to enter stateful Expo routes and present destructive confirmations reliably in web Preview.
---

For critical Expo browser verification, begin at the app root and follow the normal user navigation path. A direct deep link to a stateful route can render a blank page even when the root app and that route both work through in-app navigation.

**Why:** During Add Property verification, the Expo web root rendered normally and the Home action opened the complete flow, while loading the capture route directly produced a blank screen without a runtime error.

**How to apply:** Treat normal entry navigation as the acceptance path. Record a direct-link blank separately as a routing/preview issue unless the product explicitly requires deep-link support.

Use an accessible in-flow React Native modal for destructive transition confirmation instead of relying on `Alert.alert` in Expo web Preview.

**Why:** A transaction control received focus in web Preview, but its `Alert.alert` confirmation never became visible and the requested state change did not complete. The same transition worked after moving confirmation into an app-rendered modal.

**How to apply:** Keep Cancel inert, run stale-state checks again on Confirm, and verify both the visible selected control and dependent fields after the transition.