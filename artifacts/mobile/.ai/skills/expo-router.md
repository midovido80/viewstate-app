# ViewState AI Skill — Expo Router

**Read this before creating or modifying any navigation or routing in ViewState.**

---

## ViewState Navigation Structure

```
app/
  _layout.tsx                ← root: providers (QueryClient, SafeArea, ErrorBoundary, Keyboard, i18n)
  (auth)/
    _layout.tsx              ← auth stack (headerShown: false)
    login.tsx                ← phone number entry
    verify.tsx               ← OTP verification
    register.tsx             ← new user registration
  (tabs)/
    _layout.tsx              ← tab navigator (NativeTabs on iOS 26+ / Tabs fallback)
    index.tsx                ← Home / Dashboard
    properties.tsx           ← Property list
    contacts.tsx             ← Contacts list
    matches.tsx              ← Matches list
    settings.tsx             ← Settings / profile
  property/
    _layout.tsx              ← property stack
    [id].tsx                 ← Property detail
    create.tsx               ← Create property
    edit/[id].tsx            ← Edit property
  contact/
    [id].tsx                 ← Contact detail
  match/
    [id].tsx                 ← Match detail
  import/
    whatsapp.tsx             ← WhatsApp import flow
    contacts.tsx             ← Contacts import flow
```

---

## Rules for This Project

### File naming
- All route files: lowercase kebab-case
- Dynamic segments: `[id].tsx` — always `id` as the param name unless a more specific name is needed
- Layout groups use parentheses: `(auth)`, `(tabs)`

### Navigation patterns
- Use `router.push()` for forward navigation, `router.back()` for back
- Use `router.replace()` when the user should not be able to go back (e.g., after login)
- Deep links: use `router.push('/property/[id]')` format
- Never use `navigation.navigate()` — this is Expo Router, not React Navigation directly

### Auth guard
- Protect all `(tabs)/*` routes with an auth context check
- Redirect to `/(auth)/login` if not authenticated
- Use `Redirect` component from `expo-router` for static redirects in layout files

### Screen options
- Set `headerShown: false` in `(tabs)/_layout.tsx` screenOptions
- Configure all header options in `_layout.tsx` files — never in screen components
- Use `Stack.Screen` with `options` prop for per-screen configuration within a layout

### NativeTabs (iOS 26+)
```tsx
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

// Only use NativeTabs when isLiquidGlassAvailable() returns true
// Always provide a Tabs fallback for Android, web, and older iOS
```

### Tab configuration for ViewState
```tsx
// 4 tabs: Home, Properties, Contacts, Matches
// Settings accessed via header icon, not a tab (keeps tab bar clean)
```

### Dynamic params
```tsx
import { useLocalSearchParams } from 'expo-router';

export default function PropertyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // id is always a string — parse if needed
}
```

### Modals
- Full-screen modals: use `presentation: 'modal'` in Stack.Screen options
- Bottom sheets: use the `react-native-bottom-sheet` library (when approved) — not a Stack modal
- Never implement a custom modal layer — always use Expo Router Stack or a bottom sheet library

---

## Anti-Patterns to Avoid

- Do not nest `Stack` inside `Tabs` manually — Expo Router handles this
- Do not use `useNavigation()` from React Navigation — use `useRouter()` from `expo-router`
- Do not create `app/index.tsx` if using `(tabs)` — the tab group is the root
- Do not configure `headerShown` inside screen components — only in `_layout.tsx`
- Do not use `expo-router` `Link` component for programmatic navigation — use `router.push()`


---

## Governance Reconciliation — Effective Rules

This addendum is authoritative for future implementation after the approved governance reconciliation. Historical Stage 00.1–00.4 wording and prior decisions remain preserved as historical evidence; where a conflict exists, the later append-only reconciliation decisions control.

- Status remains PRE-IMPLEMENTATION.
- Stage 00.5 is not defined and must not be fabricated.
- Stage 01 has not begun.
- Product implementation remains unauthorized until a bounded Stage 01 Impact Analysis is approved.
- No database migration is authorized or required by this reconciliation.
- Any role, price, Draft, or compatibility migration reference is a future schema/compatibility risk only.
- If an implemented dataset is discovered before future schema work, the relevant stage must stop for a fresh compatibility and migration assessment.
- ViewState App is one Android/iOS product. Android-first is rollout priority only; iOS architectural compatibility is continuous.
- Simplicity and Speed, Capture First → Enrich Later, Private by default, Explicit sharing, and No silent loss remain mandatory.


## Governance Reconciliation — Navigation Compatibility

Navigation must preserve equivalent capability and data safety on Android and iOS. Respect Android hardware/gesture back and iOS native swipe-back/navigation. Platform-specific navigation components require safe fallbacks and must not contain authoritative business rules.

A feature is not complete until its navigation path is documented for both platforms, including modal dismissal, deep links, permission-return paths, Draft recovery, and keyboard-safe final actions.