export type PublicApiEnvironment = Readonly<{
  EXPO_PUBLIC_API_ORIGIN?: string;
  EXPO_PUBLIC_DOMAIN?: string;
}>;

function normalizeApiOrigin(candidate: string | undefined): string | null {
  const value = candidate?.trim();
  if (!value) return null;

  try {
    const parsed = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    const localDevelopmentHost = (
      parsed.hostname === 'localhost'
      || parsed.hostname === '127.0.0.1'
      || parsed.hostname === '10.0.2.2'
    );
    if (parsed.protocol !== 'https:' && !localDevelopmentHost) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Resolves the public API origin embedded by Expo at bundle time.
 * EXPO_PUBLIC_API_ORIGIN is the release contract; EXPO_PUBLIC_DOMAIN remains
 * a compatibility fallback for the managed Replit development workflow.
 */
export function resolvePublicApiOrigin(
  environment: PublicApiEnvironment = {
    EXPO_PUBLIC_API_ORIGIN: process.env.EXPO_PUBLIC_API_ORIGIN,
    EXPO_PUBLIC_DOMAIN: process.env.EXPO_PUBLIC_DOMAIN,
  },
): string | null {
  if (environment.EXPO_PUBLIC_API_ORIGIN !== undefined) {
    return normalizeApiOrigin(environment.EXPO_PUBLIC_API_ORIGIN);
  }
  return normalizeApiOrigin(environment.EXPO_PUBLIC_DOMAIN);
}

export function publicApiUrl(
  path: `/${string}`,
  environment?: PublicApiEnvironment,
): string | null {
  const origin = resolvePublicApiOrigin(environment);
  return origin ? `${origin}${path}` : null;
}