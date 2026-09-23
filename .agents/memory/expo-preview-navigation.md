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

When adding a new component file while Expo is already running, Metro may keep reporting that its import cannot be resolved even though the file exists and TypeScript resolves it. If the preview stays blank with that specific bundler error, restart the existing Expo workflow once; ordinary source edits should still hot-reload without restarting.

**Why:** During a live Requirement UI addition, Metro retained an unresolved import for a newly created component until the existing Expo workflow restarted.

**How to apply:** Check workflow logs before treating a blank page as a runtime or routing failure. Restart only when logs identify this concrete stale-resolution case, then confirm the root preview renders.

For multi-step Expo wizards, verify category decisions at the step where they are made, then inspect the next step in the real browser before relying on final candidate validation or source assertions.

**Why:** A Floor Requirement could advance without choosing Residential or Commercial; later validation would reject it, but the intervening Core page showed neither set of category-specific controls. Source assertions had passed because the controls existed inside a conditional branch.

**How to apply:** At mobile viewport, test unselected choices, each branch, transition Cancel/Confirm, and the next rendered step through normal navigation. A valid final validator does not guarantee a usable intermediate flow.

Do not assume that a new browser tester sees people or Requirements created in another browser context. If the local People screen is empty, create a uniquely named Seeker through the normal Add Person flow before testing Requirement creation.

**Why:** A UX-2 browser pass initially stopped at an empty People screen even though earlier passes had saved Seeker records. Reusing the presumed fixture would have hidden the fact that this browser had its own local state.

**How to apply:** Let the tester seed and record its own Person and Requirement IDs through visible UI, then reopen those exact records to verify persistence and edit identity.