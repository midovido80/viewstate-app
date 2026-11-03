import { TextInput } from '@/components/FormField';
import { RequiredLabelText } from '@/components/RequiredForm';
import { propertyFormInputStyle } from '@/components/PropertyFormCard';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CompactDropdown } from '@/components/FormChoices';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import {
  createNumericQuickPickLocalState,
  parseExactIntegerInput,
  reconcileNumericQuickPickScope,
  resolveExactIntegerInput,
  synchronizeNumericQuickPickValue,
} from '@/services/numericQuickPick';

const FORM_COUNT_OPTIONS = [1,2,3,4,5,6,7,8,9,10] as const;
export interface NumericQuickPickProps {
  readonly scopeKey: string;
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly onPendingValidityChange?: (scopeKey: string, invalid: boolean) => void;
  readonly testID: string;
  readonly quickPickValues?: readonly number[];
  readonly requireExactValue?: boolean;
}

export function NumericQuickPick({
  scopeKey,
  label,
  value,
  onChangeText,
  onPendingValidityChange,
  testID,
  quickPickValues = FORM_COUNT_OPTIONS,
  requireExactValue = false,
}: NumericQuickPickProps) {
  const colors = useColors();
  const { language, isRTL, fonts } = useI18n();
  const [localState, setLocalState] = useState(() => createNumericQuickPickLocalState(scopeKey, value, quickPickValues));
  const validityCallbackRef = useRef(onPendingValidityChange);

  validityCallbackRef.current = onPendingValidityChange;

  useEffect(() => {
    setLocalState(current => synchronizeNumericQuickPickValue(current, scopeKey, value, quickPickValues));
  }, [scopeKey, value, quickPickValues]);

  useEffect(() => () => validityCallbackRef.current?.(localState.scopeKey, false), [localState.scopeKey]);

  const visibleState = reconcileNumericQuickPickScope(localState, scopeKey, value, quickPickValues);
  const { expanded, pending, invalid } = visibleState;

  const parsedValue = parseExactIntegerInput(value);
  const exactInputLabel = language === 'ar' ? `${label}: قيمة دقيقة` : `${label}: exact value`;
  const invalidLabel = requireExactValue
    ? quickPickValues.includes(0)
      ? language === 'ar' ? 'أدخل عددًا صحيحًا غير سالب' : 'Enter a non-negative whole number'
      : language === 'ar' ? 'أدخل عددًا صحيحًا غير سالب' : 'Enter a non-negative whole number'
    : language === 'ar' ? 'أدخل عددًا صحيحًا غير سالب' : 'Enter a non-negative whole number';

  const setValidity = (nextInvalid: boolean) => {
    setLocalState(current => current.scopeKey === scopeKey
      ? { ...current, invalid: nextInvalid }
      : current);
    validityCallbackRef.current?.(scopeKey, nextInvalid);
  };

  return (
    <View style={styles.container} testID={testID}>
      <RequiredLabelText style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
        {label}
      </RequiredLabelText>
      <CompactDropdown testID={`${testID}-dropdown`} options={[
        { value: '', label: language === 'ar' ? 'غير محدد' : 'Not specified', selected: value === '' && !expanded },
        ...quickPickValues.map(option => ({ value: String(option), label: option === 0 ? (language === 'ar' ? 'لا يوجد (0)' : 'None (0)') : String(option), selected: !expanded && parsedValue.kind === 'valid' && parsedValue.value === option, testID: `${testID}-${option}` })),
        { value: 'manual', label: language === 'ar' ? 'عدد آخر…' : 'Other number…', selected: expanded },
      ]} onSelect={option => {
        setValidity(false);
        if (option === 'manual') {
          setLocalState(current => ({ ...current, pending: value, expanded: true, invalid: false }));
        } else {
          setLocalState(current => ({ ...current, pending: option, expanded: false, invalid: false }));
          onChangeText(option);
        }
      }} />
      {expanded ? (
        <>
          <TextInput
            invalid={invalid}
            value={pending}
            onChangeText={input => {
              const transition = resolveExactIntegerInput(input, value, false, quickPickValues);
              setLocalState(current => current.scopeKey === scopeKey
                ? { ...current, pending: transition.pending, invalid: transition.invalid }
                : current);
              setValidity(transition.invalid);
              // Keep the pending text in the owning draft as well. This lets
              // Review/Save validate the same candidate instead of silently
              // retaining a previous valid value while an invalid exact entry
              // is visible.
              onChangeText(transition.invalid && transition.pending !== ''
                ? transition.pending
                : transition.committedValue);
            }}
            keyboardType="number-pad"
            accessibilityLabel={exactInputLabel}
            accessibilityHint={invalid ? invalidLabel : undefined}
            style={[
              styles.input,
            propertyFormInputStyle,
              {
                color: colors.foreground,
                borderColor: invalid ? colors.destructive : colors.border,
                backgroundColor: colors.card,
                textAlign: isRTL ? 'right' : 'left',
              },
            ]}
            testID={`${testID}-exact-input`}
          />
          {invalid ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[styles.error, { color: colors.destructive, fontFamily: fonts.medium }]}
            >
              {invalidLabel}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 15,
    lineHeight: 22,
  },
  choices: {
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    minWidth: 46,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  error: {
    fontSize: 13,
  },
});
