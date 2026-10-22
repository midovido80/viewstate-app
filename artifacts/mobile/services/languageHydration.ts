export type SupportedLanguage = 'en' | 'ar';

export interface LanguageHydrationOptions {
  readonly readStoredLanguage: () => Promise<string | null>;
  readonly selectionVersionAtStart: number;
  readonly getSelectionVersion: () => number;
  readonly isActive: () => boolean;
  readonly applyLanguage: (language: SupportedLanguage) => void;
  readonly onReadError: (error: unknown) => void;
}

export function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value === 'en' || value === 'ar';
}

export async function hydrateLanguagePreference({
  readStoredLanguage,
  selectionVersionAtStart,
  getSelectionVersion,
  isActive,
  applyLanguage,
  onReadError,
}: LanguageHydrationOptions): Promise<void> {
  try {
    const storedLanguage = await readStoredLanguage();
    if (
      isActive()
      && getSelectionVersion() === selectionVersionAtStart
      && isSupportedLanguage(storedLanguage)
    ) {
      applyLanguage(storedLanguage);
    }
  } catch (error) {
    onReadError(error);
  }
}