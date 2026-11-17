export type StoredRecordType = 'property' | 'person' | 'requirement';

export interface UnreadableRecord {
  readonly type: StoredRecordType;
  readonly id: string;
}

export type StoredRecordParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly warning: UnreadableRecord };

/**
 * Parses one persisted record without retaining or exposing its raw contents.
 * The caller supplies the storage row identity so malformed JSON can still be
 * reported without attempting to inspect the malformed value.
 */
export function parseStoredRecord<T>(
  raw: string,
  record: UnreadableRecord,
  validate: (value: unknown) => boolean,
): StoredRecordParseResult<T> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!validate(value)) {
      return { ok: false, warning: record };
    }
    return { ok: true, value: value as T };
  } catch {
    return { ok: false, warning: record };
  }
}

export function appendUnreadableRecord(
  warnings: UnreadableRecord[],
  warning: UnreadableRecord,
): void {
  if (!warnings.some(item => item.type === warning.type && item.id === warning.id)) {
    warnings.push(warning);
  }
}