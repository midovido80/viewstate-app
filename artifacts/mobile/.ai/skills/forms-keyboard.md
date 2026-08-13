# ViewState AI Skill — Forms & Keyboard

**Read this before implementing any form or keyboard interaction in ViewState.**

---

## Required Library

All keyboard handling in ViewState uses `react-native-keyboard-controller`. This is pre-installed in the Expo scaffold.

**Never use:**
- React Native's built-in `KeyboardAvoidingView`
- `InputAccessoryView` (does not render in Expo Go)
- Manual `Keyboard.addListener` without the controller

---

## Form Pattern (Standard)

All multi-field forms use `KeyboardAwareScrollViewCompat`:

```tsx
import { KeyboardAwareScrollViewCompat } from 'react-native-keyboard-controller';

export default function CreatePropertyForm() {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAwareScrollViewCompat
      bottomOffset={16}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: 16,
        paddingBottom: insets.bottom + 32,
      }}
    >
      <FieldInput label="title_ar" />
      <FieldInput label="title_en" />
      {/* more fields */}
      <SubmitButton />
    </KeyboardAwareScrollViewCompat>
  );
}
```

---

## ViewState Form Components

### FieldInput (standard text field)
```tsx
interface FieldInputProps {
  labelAr: string;
  labelEn: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  required?: boolean;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  testID?: string;
}
```

Rules:
- Required fields show red asterisk after label
- Error message appears below field on blur (not on every keystroke)
- RTL-aware: Arabic inputs use `textAlign: 'right'`, English use `textAlign: 'left'`
- `returnKeyType`: `"next"` for non-final fields, `"done"` for final field
- Use `ref` forwarding to allow programmatic `.focus()` from outside

### PickerField (dropdowns)
- Use native `ActionSheetIOS` on iOS, custom bottom sheet on Android
- Never use `<Picker>` from React Native — it looks different on every platform
- Options always provided in both Arabic and English

### NumberInput
- Use `keyboardType="numeric"` or `keyboardType="decimal-pad"` as appropriate
- Validate on blur — show error if value is outside expected range
- For currency fields: format with locale-appropriate separators

---

## Bilingual Input Rules

```tsx
// Arabic text input
<TextInput
  value={titleAr}
  onChangeText={setTitleAr}
  textAlign="right"
  style={[styles.input, { textAlign: 'right' }]}
  placeholder="اكتب العنوان بالعربية"
  placeholderTextColor={colors.mutedForeground}
/>

// English text input
<TextInput
  value={titleEn}
  onChangeText={setTitleEn}
  textAlign="left"
  style={[styles.input, { textAlign: 'left' }]}
  placeholder="Enter title in English"
  placeholderTextColor={colors.mutedForeground}
/>
```

---

## Validation Pattern

```typescript
// Form validation — always on blur, never on every keystroke
function validateProperty(values: PropertyFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!values.title_ar && !values.title_en) {
    errors.title = 'يرجى إدخال العنوان'; // Arabic first
  }

  if (!values.price || values.price <= 0) {
    errors.price = 'يرجى إدخال سعر صحيح';
  }

  if (!values.type) {
    errors.type = 'يرجى تحديد نوع العقار';
  }

  return errors;
}
```

---

## Submit Button State Machine

```tsx
type SubmitState = 'idle' | 'loading' | 'success' | 'error';

// Button disabled when state === 'loading'
// Button shows spinner when state === 'loading'
// Button shows checkmark briefly when state === 'success'
// Button resets to 'idle' after 2 seconds from 'success'
// Error shown as inline toast — not in button
```

---

## Phone Number Input (special case for auth)

- Use `keyboardType="phone-pad"`
- Strip all non-digit characters on change
- Show formatted number: `+20 1X XXXX XXXX` for Egyptian numbers
- Validate: Egyptian mobile numbers start with `010`, `011`, `012`, or `015`
- Never store the formatted version — only store the clean international format: `+201XXXXXXXXX`
