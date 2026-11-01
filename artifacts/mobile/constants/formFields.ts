/** Approved field states. These tokens deliberately do not recolor cards or action buttons. */
export const formFieldColors = {
  background: '#FFFFFF', border: '#8290A4', text: '#173F78', placeholder: '#66758A',
  activeBackground: '#E4EBF4', activeBorder: '#245DF4',
  errorBackground: '#FFF1F0', errorBorder: '#D92D20',
  disabledBackground: '#EEF1F5', disabledBorder: '#A4ADBA',
} as const;

const errorBorders = new Set(['#c62828', '#e11d48', '#c52f3b', '#e0a3a3', '#bc2525', '#c33434', '#d92d20', '#d64545', '#d32f2f']);
export function isFieldErrorBorder(color: unknown): boolean {
  return typeof color === 'string' && errorBorders.has(color.toLowerCase());
}
export function fieldSurface({ active = false, invalid = false, disabled = false } = {}) {
  return {
    borderWidth: 1.5,
    outlineWidth: 0,
    outlineStyle: 'solid',
    borderRadius: 12,
    borderColor: invalid ? formFieldColors.errorBorder : disabled ? formFieldColors.disabledBorder : active ? formFieldColors.activeBorder : formFieldColors.border,
    backgroundColor: invalid ? formFieldColors.errorBackground : disabled ? formFieldColors.disabledBackground : active ? formFieldColors.activeBackground : formFieldColors.background,
  } as const;
}
