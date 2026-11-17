# ViewState — UX Documentation

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

This directory contains UX documentation for ViewState: user flows, wireframe notes, E2E test checklists, and screen inventories.

---

## UX Doc Index

| Doc | Status |
|-----|--------|
| [Screen Inventory](./screen-inventory.md) | 🔒 To be written before UI layer |
| [User Flows](./user-flows.md) | 🔒 To be written before UI layer |
| [E2E Checklist — Auth](./e2e-auth.md) | 🔒 To be written before auth screen build |
| [E2E Checklist — Properties](./e2e-properties.md) | 🔒 To be written before property screens |
| [E2E Checklist — Matching](./e2e-matching.md) | 🔒 To be written before match screens |
| [RTL QA Checklist](./rtl-qa.md) | 🔒 To be written before any screen |

---

## Screen Inventory (Planned)

```
Onboarding / Auth
  ├── Welcome screen (language selection: Arabic / English)
  ├── Phone number entry
  ├── OTP verification
  └── Profile setup (name, role)

Main App — Tab Bar
  ├── Home / Dashboard
  │   ├── Recent matches count
  │   ├── Recent properties added
  │   └── Quick actions
  ├── Properties
  │   ├── Property list
  │   ├── Property detail
  │   ├── Create property (form)
  │   └── Edit property (form)
  ├── Contacts
  │   ├── Contact list
  │   ├── Contact detail
  │   ├── Add contact (manual)
  │   └── Import contacts (device / WhatsApp)
  └── Matches
      ├── Match list
      └── Match detail (with breakdown)

Settings
  ├── Profile
  ├── Language (Arabic / English)
  ├── Notifications
  └── About
```

---

## RTL QA Checklist Template

Before marking any screen as complete:

- [ ] Screen renders correctly with `I18nManager.isRTL = true`
- [ ] Directional icons (arrows, back button) are flipped in RTL
- [ ] Text alignment is correct (Arabic: right-aligned, English: left-aligned)
- [ ] FlatList/ScrollView scrolls in the correct direction
- [ ] Form fields have correct `textAlign` per language
- [ ] Tab bar icon order is correct in both directions
- [ ] No hardcoded `flexDirection: 'row'` (must use RTL-aware pattern)

---

## Bilingual UX Principles

1. **Default to the user's device language.** On first launch, check `expo-localization` and set the app locale accordingly.
2. **Language toggle always visible.** The language switch must be accessible from the Settings tab — never buried.
3. **RTL/LTR layout changes.** When the user switches from Arabic to English (or vice versa), the app reloads to apply the new layout direction via `I18nManager.forceRTL()`. This is expected behavior — warn the user with an alert before the reload.
4. **No mixed-direction screens.** A screen is either entirely RTL or entirely LTR. Never mix directions within a screen's layout.
