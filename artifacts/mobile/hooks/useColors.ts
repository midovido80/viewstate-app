import colors from '@/constants/colors';

/**
 * Returns the design tokens.
 * ViewState Kuwait V001 strictly enforces the light palette. No dark mode.
 */
export function useColors() {
  return {
    ...colors.light,
    vapp47: colors.vapp47,
    inputRadius: colors.inputRadius,
    cardRadius: colors.cardRadius,
    modalRadius: colors.modalRadius,
    spacing: colors.spacing,
  };
}
