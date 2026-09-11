/**
 * ViewState Mobile Design Tokens
 * Kuwait V001: calm, professional, modern, and comfortable.
 * Strictly light theme.
 */

const colors = {
  light: {
    text: '#0F1D2E',
    tint: '#1976F3',

    background: '#F6F8FA',
    foreground: '#0F1D2E',

    card: '#FFFFFF',
    cardForeground: '#0F1D2E',

    primary: '#1976F3',
    primaryForeground: '#FFFFFF',

    turquoise: '#18B5A6',

    secondary: '#E6F7F5',
    secondaryForeground: '#18B5A6',

    muted: '#E5E7EB', // Slightly darker than background for dividers/empty backgrounds
    mutedForeground: '#6B7280',

    accent: '#E6F7F5', // Secondary turquoise background
    accentForeground: '#18B5A6',

    destructive: '#FF6B6B',
    destructiveForeground: '#FFFFFF',

    success: '#A6D96A',
    whatsapp: '#25D366',
    whatsappForeground: '#062B18',
    warning: '#FFB84D',

    border: '#E5E7EB',
    input: '#FFFFFF',
  },

  vapp47: {
    brandPrimary: '#1A56FF',
    dataEmphasis: '#E11D48',
    communication: '#16A34A',
    appSurface: '#F7F8FB',
    cardSurface: '#FFFFFF',
    visualBorder: '#EEF0F4',
    brandSoft: '#EEF3FF',
    disabledSurface: '#EEF0F4',
    textPrimary: '#0F172A',
    textMuted: '#64748B',
    warning: '#B45309',
    homeCardRadius: 18,
    homeShadow: {
      shadowColor: '#0F172A',
      shadowOffset: {
        width: 0,
        height: 6,
      },
      shadowOpacity: 0.06,
      shadowRadius: 18,
      elevation: 3,
    },
  },

  inputRadius: 14,
  cardRadius: 16,
  modalRadius: 20,
  spacing: 8,
};

export default colors;
