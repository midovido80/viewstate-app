import { posix, win32 } from 'node:path';
import { fileURLToPath, type URL } from 'node:url';

export function resolveSourcePath(
  sourcePath: string,
  moduleUrl: string | URL,
  windows = process.platform === 'win32',
): string {
  const path = windows ? win32 : posix;
  if (path.isAbsolute(sourcePath)) return path.normalize(sourcePath);
  return path.resolve(
    path.dirname(fileURLToPath(moduleUrl, { windows })),
    sourcePath,
  );
}
