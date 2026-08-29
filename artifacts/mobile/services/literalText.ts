import type {
  ClassifiedLiteralText,
  PrivacyMetadata,
} from '@workspace/property-domain';

/**
 * Treat trimmed content only as the blank/nonblank decision. The stored value
 * remains exactly as entered or imported.
 */
export function optionalClassifiedLiteral(
  value: string,
  privacy: PrivacyMetadata,
): ClassifiedLiteralText | undefined {
  return value.trim().length > 0 ? { value, privacy } : undefined;
}