# ViewState AI Skill — Debugging

**Read this before debugging any issue in ViewState.**

---

## Debugging Protocol

When debugging, follow this order. Never jump to step 3 without completing steps 1 and 2.

### Step 1 — Reproduce the bug
- State the exact repro steps
- State the expected behavior
- State the actual behavior
- Note: device (iOS/Android/web), locale (ar/en), RTL/LTR

### Step 2 — Identify the layer
| Symptom | Likely layer |
|---------|-------------|
| UI looks wrong | Component / StyleSheet |
| Text not in correct language | i18n / locale context |
| Layout broken in RTL | RTL/LTR handling |
| Data not showing | React Query / API |
| Navigation broken | Expo Router |
| Keyboard covering input | Keyboard controller |
| App crash on startup | _layout.tsx / providers |
| Crash on iOS only | Platform-specific code |
| Network request failing | API server / auth token |
| DB query returning wrong data | Drizzle query / missing filter |

### Step 3 — Minimal reproduction
Isolate the bug to the smallest possible reproduction. Do not touch unrelated code.

### Step 4 — Fix and verify
Apply the fix. Verify the original repro steps no longer reproduce the bug. Do not over-fix — fix only what is broken.

---

## Common Issues in This Project

### RTL Layout Broken
```typescript
// Check: is flexDirection hardcoded?
// BAD:
flexDirection: 'row',

// GOOD:
flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
```

### Arabic text not showing
```typescript
// Check: is the font loaded and does it support Arabic?
// Verify: Inter does NOT support Arabic — use IBM Plex Arabic or Noto Sans Arabic
// Check: is the string key correct in ar.json?
// Check: is the locale context returning 'ar'?
```

### Keyboard covers input
```typescript
// Check: is KeyboardAwareScrollViewCompat wrapping the form?
// Check: is bottomOffset set (recommend 16-32)?
// Check: is there a nested KeyboardAvoidingView? Remove it.
```

### FlatList not refreshing
```typescript
// Check: is the data array reference changing on refresh?
// React Query: does the queryKey include all filter params?
// Check: is staleTime set too high for this use case?
```

### Match score is 0
```typescript
// Log the breakdown object from calculateMatchScore
// Check: are null fields being handled correctly?
// Check: is the location field comparison using the same ID format from market config?
// Check: is price stored as a string and not parsed to number before comparison?
```

### Phone number not normalizing
```typescript
// Log the raw input to the phone normalization function
// Check: is the market phone pattern loaded correctly from market config?
// Check: does the input match the expected format for the active market?
// Check: is the output stored as clean E.164 (e.g., +XXXXXXXXXXX)?
```

### WhatsApp import finds 0 contacts
```typescript
// Log the first 10 lines of the file
// Check: is it iOS or Android format? Test both regex patterns
// Check: does the file have BOM (byte-order mark) at the start? Strip it.
// Check: is the file encoding UTF-8? WhatsApp exports are UTF-8 with BOM.
```

---

## Logging Rules

- Server: use `req.log.info(...)` in route handlers, `logger.info(...)` elsewhere
- Client: use `console.warn(...)` for non-critical issues, `console.error(...)` for errors
- Never leave `console.log(...)` debug statements in committed code
- In React Query, use `onError` callback to log API errors

---

## Expo Workflow Debugging

```bash
# Check Expo Metro bundler logs
# (via RefreshAllLogs tool — do not run expo directly)

# Type errors
pnpm --filter @workspace/mobile run typecheck

# Check for import errors
pnpm --filter @workspace/mobile run typecheck 2>&1 | head -50
```

---

## "Red Screen of Death" (Metro error) Triage

| Error | Cause | Fix |
|-------|-------|-----|
| `Unable to resolve module` | Wrong import path or missing package | Check `@/` alias, run `pnpm install` |
| `Invariant Violation` | Component rendered outside provider | Wrap in correct provider in `_layout.tsx` |
| `Text strings must be rendered within a <Text> component` | Raw string in JSX | Find and wrap the string in `<Text>` |
| `Objects are not valid as a React child` | Rendering an object instead of a string | Stringify or access the correct property |
| `Cannot read property X of undefined` | Missing null check | Add `?.` optional chaining |
| `Require cycle` | Circular import | Restructure module dependencies |

---

## Before Declaring "Fixed"

1. ✅ The original repro steps no longer reproduce the bug
2. ✅ No new TypeScript errors introduced (`pnpm typecheck`)
3. ✅ The fix works in both Arabic (RTL) and English (LTR) modes
4. ✅ The fix works on both iOS (Expo Go) and web preview
5. ✅ No `console.log` debug statements left in the code
