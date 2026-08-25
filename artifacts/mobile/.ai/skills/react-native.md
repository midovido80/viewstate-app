# ViewState AI Skill — React Native

**Read this before writing any React Native code in ViewState.**

---

## Core Rules for This Project

### Styling
- Never hardcode hex values in components — always use `colors.*` from `useColors()`
- Use `StyleSheet.create()` for all styles — no inline style objects except for dynamic values
- All layout must be RTL-aware: test every screen in RTL mode before marking done
- Minimum touch target: 44×44pt enforced via `minWidth`/`minHeight` on all tappable elements
- Use `useSafeAreaInsets()` for all top/bottom padding — no hardcoded values

### State
- `useState` for component-local state only
- `useContext` + providers for shared state (auth, locale, theme)
- `useQuery` / `useMutation` from TanStack React Query for all server state
- AsyncStorage for persistent local state (via context provider — never called directly in a component)

### Typography
- Arabic body: minimum 16pt
- English body: 14–16pt
- Arabic must use a font that supports Arabic script (IBM Plex Arabic or Noto Sans Arabic)
- Never mix Arabic and Latin text in the same `<Text>` element

### Performance
- `FlatList` (not `ScrollView`) for all lists longer than 10 items
- `keyExtractor` always uses a stable unique ID (never array index)
- `useCallback` on FlatList `renderItem` props
- Avoid anonymous functions in JSX — extract them to named callbacks

### Error Handling
- Every async operation has a try/catch
- Errors surface as inline UI (not Alert dialogs) with a retry button
- Network errors show in the user's current language

### Platform Differences
- Use `Platform.OS` checks only when absolutely necessary
- Contacts, location, media library: use `Platform.OS !== 'web'` guard
- Test on web preview (Expo web) and native (Expo Go) separately

### Prohibited Patterns
- No `// @ts-ignore` or `// @ts-expect-error` without a comment explaining why and a TODO to fix
- No `any` type in production code
- No `useEffect` to sync state from props (causes infinite loops)
- No `setTimeout` for UI timing — use `Animated` or `LayoutAnimation`
- No inline `new Date()` without passing a value — crashes on iOS in some Expo versions

---

## ViewState-Specific Patterns

### Bilingual text rendering
```tsx
import { useLocale } from '@/hooks/useLocale';

function PropertyTitle({ titleAr, titleEn }: { titleAr: string; titleEn: string }) {
  const { locale } = useLocale();
  return (
    <Text style={styles.title}>
      {locale === 'ar' ? titleAr : titleEn}
    </Text>
  );
}
```

### RTL-aware row layout
```tsx
import { I18nManager, StyleSheet, View } from 'react-native';

const styles = StyleSheet.create({
  row: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 8,
  },
});
```

### Safe area padding template
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* content */}
    </View>
  );
}
```

### Standard empty state
```tsx
import { Feather } from '@expo/vector-icons';
import { useT } from '@/hooks/useT'; // i18n hook

function EmptyState({ translationKey }: { translationKey: string }) {
  const t = useT();
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <Feather name="inbox" size={40} color={colors.mutedForeground} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        {t(`${translationKey}.emptyTitle`)}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
        {t(`${translationKey}.emptySubtitle`)}
      </Text>
    </View>
  );
}
```


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


## Governance Reconciliation — React Native Platform Rules

Use shared product logic for validation, matching, persistence, Drafts, privacy, and migrations. Isolate Contacts, media, files, maps, share channels, notifications, secure storage/authentication, deep links, and future Card opening behind replaceable adapters.

Android is first for rollout and pilot validation. iOS architectural compatibility is continuous. Every dependency requires Android, iOS, and Expo review, documented justification, and a safe fallback.

Verify Arabic/English, RTL/LTR, keyboard behavior, accessibility, responsive layout, Android back, and iOS navigation on both platforms. Build and type-check success alone is not product evidence.