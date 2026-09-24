import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ChoiceChip } from '@/components/ChoiceChip';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import {
  NUMERIC_QUICK_PICK_VALUES,
  createNumericQuickPickLocalState,
  openNumericExactEntry,
  openRequiredNumericExactEntry,
  parseExactIntegerInput,
  reconcileNumericQuickPickScope,
  resolveExactIntegerInput,
  selectNumericQuickPick,
  synchronizeNumericQuickPickValue,
} from '@/services/numericQuickPick';

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
  quickPickValues = NUMERIC_QUICK_PICK_VALUES,
  requireExactValue = false,
}: NumericQuickPickProps) {
  const colors = useColors();
  const { language, isRTL, fonts } = useI18n();
  const [localState, setLocalState] = useState(() => createNumericQuickPickLocalState(scopeKey, value));
  const validityCallbackRef = useRef(onPendingValidityChange);

  validityCallbackRef.current = onPendingValidityChange;

  useEffect(() => {
    setLocalState(current => synchronizeNumericQuickPickValue(current, scopeKey, value));
  }, [scopeKey, value]);

  useEffect(() => () => validityCallbackRef.current?.(localState.scopeKey, false), [localState.scopeKey]);

  const visibleState = reconcileNumericQuickPickScope(localState, scopeKey, value);
  const { expanded, pending, invalid } = visibleState;

  const parsedValue = parseExactIntegerInput(value);
  const exactActionLabel = language === 'ar' ? 'إدخال قيمة دقيقة' : 'Enter exact value';
  const exactInputLabel = language === 'ar' ? `${label}: قيمة دقيقة` : `${label}: exact value`;
  const invalidLabel = requireExactValue
    ? language === 'ar' ? 'أدخل عددًا صحيحًا لا يقل عن ٦' : 'Enter a whole number of 6 or more'
    : language === 'ar' ? 'أدخل عددًا صحيحًا غير سالب' : 'Enter a non-negative whole number';

  const setValidity = (nextInvalid: boolean) => {
    setLocalState(current => current.scopeKey === scopeKey
      ? { ...current, invalid: nextInvalid }
      : current);
    validityCallbackRef.current?.(scopeKey, nextInvalid);
  };

  return (
    <View style={styles.container} testID={testID}>
      <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
        {label}
      </Text>
      <View style={[styles.choices, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {quickPickValues.map(option => (
          <ChoiceChip
            key={option}
            label={String(option)}
            selected={parsedValue.kind === 'valid' && parsedValue.value === option}
            onPress={() => {
              const next = selectNumericQuickPick(option);
              setLocalState(current => current.scopeKey === scopeKey
                ? { ...current, pending: next, expanded: false, invalid: false }
                : current);
              setValidity(false);
              onChangeText(next);
            }}
            testID={`${testID}-${option}`}
            role="radio"
            style={styles.choice}
          />
        ))}
        <ChoiceChip
          label="+6"
          accessibilityLabel={language === 'ar' ? 'إدخال قيمة دقيقة ستة أو أكثر' : 'Enter an exact value of six or more'}
          selected={expanded && parsedValue.kind === 'valid' && parsedValue.value >= 6}
          onPress={() => {
            const transition = requireExactValue
              ? openRequiredNumericExactEntry(value)
              : { ...openNumericExactEntry(value), invalid: false };
            setLocalState(current => current.scopeKey === scopeKey
              ? { ...current, pending: transition.value, expanded: transition.expanded, invalid: transition.invalid }
              : current);
            setValidity(transition.invalid);
          }}
          testID={`${testID}-6-plus`}
          role="button"
          style={styles.choice}
        />
      </View>
      {!expanded ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={exactActionLabel}
          style={styles.exactActionButton}
          onPress={() => {
            const transition = requireExactValue
              ? openRequiredNumericExactEntry(value)
              : { ...openNumericExactEntry(value), invalid: false };
            setLocalState(current => current.scopeKey === scopeKey
              ? { ...current, pending: transition.value, expanded: transition.expanded, invalid: transition.invalid }
              : current);
            setValidity(transition.invalid);
          }}
          testID={`${testID}-exact-open`}
        >
          <Text style={[styles.exactAction, { color: colors.primary, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
            {exactActionLabel}
          </Text>
        </TouchableOpacity>
      ) : (
        <>
          <TextInput
            value={pending}
            onChangeText={input => {
              const transition = resolveExactIntegerInput(input, value, requireExactValue);
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
  },
  choices: {
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    minWidth: 46,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  exactActionButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  exactAction: {
    paddingVertical: 4,
    fontSize: 14,
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