export interface ScreenInsets {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** Insets plus breathing room for custom headers and fixed actions. Never replace a larger device inset. */
export function screenInsets(insets: ScreenInsets, platform: string, width: number, statusBarHeight = 0): ScreenInsets {
  const mobileWeb = platform === 'web' && width <= 600;
  // A narrow browser preview may report zero safe area despite showing phone chrome.
  const topFallback = mobileWeb ? 48 : platform === 'android' ? statusBarHeight : 0;
  return {
    ...insets,
    top: Math.max(insets.top, topFallback) + 8,
    bottom: Math.max(insets.bottom, mobileWeb ? 20 : 0) + 12,
  };
}

export function isMissingPositiveAmount(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === ''
    || !Number.isFinite(Number(value)) || Number(value) <= 0;
}
