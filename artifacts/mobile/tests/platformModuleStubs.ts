import { registerHooks } from 'node:module';

const moduleSources = new Map<string, string>([
  [
    'expo-crypto',
    'export const randomUUID = () => globalThis.crypto.randomUUID();',
  ],
  [
    'react-native',
    "export const Platform = { OS: 'web' };",
  ],
  [
    'expo-sqlite',
    "export const openDatabaseAsync = async () => { throw new Error('UNEXPECTED_REAL_SQLITE_OPEN'); };",
  ],
  [
    '@react-native-async-storage/async-storage',
    'export default { getItem: async () => null, setItem: async () => undefined };',
  ],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = moduleSources.get(specifier);
    if (source === undefined) return nextResolve(specifier, context);
    return {
      url: `test-stub:${specifier}`,
      shortCircuit: true,
    };
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('test-stub:')) return nextLoad(url, context);
    const specifier = url.slice('test-stub:'.length);
    const source = moduleSources.get(specifier);
    if (source === undefined) throw new Error(`Missing test stub for ${specifier}`);
    return {
      format: 'module',
      source,
      shortCircuit: true,
    };
  },
});