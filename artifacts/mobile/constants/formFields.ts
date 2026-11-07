/** Approved field states. These tokens deliberately do not recolor cards or action buttons. */
export const formFieldColors = {
  background: '#FFFFFF', border: '#ADBFDF', text: '#18355C', placeholder: '#66758A',
  activeBackground: '#F3F6FF', activeBorder: '#2454ED',
  errorBackground: '#FFF1F0', errorBorder: '#D92D20',
  disabledBackground: '#EEF1F5', disabledBorder: '#A4ADBA',
} as const;

const errorBorders = new Set(['#c62828', '#e11d48', '#c52f3b', '#e0a3a3', '#bc2525', '#c33434', '#d92d20', '#d64545', '#d32f2f']);
export function isFieldErrorBorder(color: unknown): boolean {
  return typeof color === 'string' && errorBorders.has(color.toLowerCase());
}
export function fieldSurface({ active = false, invalid = false, disabled = false } = {}) {
  return {
    borderWidth: 1,
    outlineWidth: 0,
    outlineStyle: 'solid',
    borderRadius: 12,
    borderColor: invalid ? formFieldColors.errorBorder : disabled ? formFieldColors.disabledBorder : active ? formFieldColors.activeBorder : formFieldColors.border,
    backgroundColor: invalid ? formFieldColors.errorBackground : disabled ? formFieldColors.disabledBackground : active ? formFieldColors.activeBackground : formFieldColors.background,
  } as const;
}
