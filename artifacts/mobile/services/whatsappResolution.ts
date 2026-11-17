export type AndroidWhatsAppVariant = 'whatsapp' | 'whatsapp_business';

const destinationSchemes: Record<AndroidWhatsAppVariant, string> = {
  whatsapp: 'whatsapp',
  whatsapp_business: 'whatsapp-business',
};

export function selectWhatsAppScheme(
  available: readonly AndroidWhatsAppVariant[],
): string | null {
  const unique = [...new Set(available)];
  if (unique.length === 0) return null;
  return unique.length > 1 ? destinationSchemes.whatsapp : destinationSchemes[unique[0]];
}

export function whatsappSchemeForVariant(variant: AndroidWhatsAppVariant): string {
  return destinationSchemes[variant];
}