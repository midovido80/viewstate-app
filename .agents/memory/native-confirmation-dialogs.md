---
name: Native confirmation dialogs
description: Cross-platform guidance for destructive confirmations in the Expo mobile app.
---

Use explicit in-app localized confirmation modals for destructive or unlink actions that must also work in the web preview; do not rely on React Native `Alert`.

**Why:** `Alert.alert` can be inert in the Expo web preview even though the same action works natively, making required Yes/No confirmation unavailable and untestable there.

**How to apply:** Keep body/card presses navigational, open a controlled modal only from the dedicated destructive action, and provide distinct localized cancel and confirm controls.