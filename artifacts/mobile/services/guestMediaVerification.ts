interface Reader { readBytes(length: number): Uint8Array; close(): void }
interface LocalFile { size: number; open(): Reader }
/** Bounded native-file verification: large videos never require two full files in JS memory. */
export async function verifyGuestMediaCopy(source: LocalFile, target: LocalFile, assertActive: () => void): Promise<boolean> {
  assertActive(); const size = source.size;
  if (!Number.isSafeInteger(size) || size < 0 || target.size !== size) return false;
  const a = source.open(); let b: Reader | undefined;
  try {
    b = target.open(); let offset = 0, chunks = 0;
    while (offset < size) {
      assertActive(); const length = Math.min(64 * 1024, size - offset);
      const x = a.readBytes(length), y = b.readBytes(length);
      if (x.length !== length || y.length !== length || !x.every((v, i) => v === y[i])) return false;
      offset += length;
      if (++chunks % 16 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    assertActive(); return source.size === size && target.size === size;
  } finally { try { b?.close(); } finally { a.close(); } }
}
