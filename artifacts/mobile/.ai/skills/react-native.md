# ViewState AI Skill — React Native

**Read this before writing any React Native code in ViewState.**

---

## Current Cross-Platform Rule

ViewState is one Android/iOS product. Android-first rollout does not permit Android-only architecture. Expo Go is a preview/testing option only; dependencies and native adapters require Android, iOS, and Expo compatibility review, with replaceable platform fallbacks.


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
