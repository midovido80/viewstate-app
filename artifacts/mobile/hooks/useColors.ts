import colors from '@/constants/colors';

/**
 * Returns the design tokens.
 * ViewState Kuwait V001 strictly enforces the light palette. No dark mode.
 */
export function useColors() {
  return {
    ...colors.light,
    inputRadius: colors.inputRadius,
    cardRadius: colors.cardRadius,
    modalRadius: colors.modalRadius,
    spacing: colors.spacing,
  };
}
