import React, { createContext, forwardRef, useContext, useState } from 'react';
import { StyleSheet, TextInput as NativeTextInput, TouchableOpacity, type TextInputProps, type TouchableOpacityProps, type View } from 'react-native';
import { fieldSurface, formFieldColors, isFieldErrorBorder } from '@/constants/formFields';

/** Required-field groups pass presentation state without changing their validation rules. */
export const FieldValidationContext = createContext(false);
export type TextInput = NativeTextInput;
export type FormTextInputProps = TextInputProps & { invalid?: boolean; inheritValidation?: boolean };

/** Keep the native input, ref, keyboard, selection and caller callbacks intact. */
export const TextInput = forwardRef<NativeTextInput, FormTextInputProps>(function FormTextInput(
  { style, invalid = false, inheritValidation = true, onFocus, onBlur, editable, ...props }, ref,
) {
  const [focused, setFocused] = useState(false);
  const groupInvalid = useContext(FieldValidationContext);
  const existing = StyleSheet.flatten(style);
  const error = invalid || (inheritValidation && groupInvalid) || isFieldErrorBorder(existing?.borderColor);
  return <NativeTextInput {...props} ref={ref} editable={editable}
    underlineColorAndroid="transparent" placeholderTextColor={formFieldColors.placeholder}
    onFocus={event => { setFocused(true); onFocus?.(event); }}
    onBlur={event => { setFocused(false); onBlur?.(event); }}
    style={[{ color: formFieldColors.text, paddingHorizontal: 14, minHeight: existing?.minHeight ?? existing?.height ?? 48 }, style,
      fieldSurface({ active: focused, invalid: error, disabled: editable === false || props.readOnly === true })]} />;
});

/** Dropdown launchers use the same surface while their picker is open or keyboard-focused. */
export const FieldSelect = forwardRef<View, TouchableOpacityProps & { active?: boolean; invalid?: boolean }>(function FieldSelect(
  { style, active = false, invalid = false, onFocus, onBlur, disabled, accessibilityState, ...props }, ref,
) {
  const [focused, setFocused] = useState(false);
  const groupInvalid = useContext(FieldValidationContext);
  const error = invalid || groupInvalid || isFieldErrorBorder(StyleSheet.flatten(style)?.borderColor);
  return <TouchableOpacity {...props} ref={ref} disabled={disabled} accessibilityRole="button" aria-expanded={active}
    accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled), expanded: active }}
    onFocus={event => { setFocused(true); onFocus?.(event); }}
    onBlur={event => { setFocused(false); onBlur?.(event); }}
    style={[{ minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' }, style,
      fieldSurface({ active: active || focused, invalid: error, disabled: Boolean(disabled) })]} />;
});
