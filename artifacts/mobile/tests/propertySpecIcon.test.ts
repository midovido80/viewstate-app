import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolveSourcePath } from './sourcePath.ts';

const stubs = new Map([
  ['react', `const createElement = (type, props, ...children) => ({ type, props: { ...props, children } }); const React = { createElement }; globalThis.React = React; export { createElement }; export default React;`],
  ['react/jsx-runtime', `export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx;`],
  ['react-native-svg', `export default 'Svg'; export const Path = 'Path';`],
]);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'expo-font' || specifier === '@expo/vector-icons') throw new Error('Icon fonts unavailable: simulate blocked font downloads');
    return stubs.has(specifier) ? { url: `spec-icon-test:${encodeURIComponent(specifier)}`, shortCircuit: true } : next(specifier, context);
  },
  load(url, context, next) {
    return url.startsWith('spec-icon-test:') ? { format: 'module', source: stubs.get(decodeURIComponent(url.slice('spec-icon-test:'.length)))!, shortCircuit: true } : next(url, context);
  },
});

test('Every numeric Property icon renders with font loading unavailable', async () => {
  const { PropertySpecIcon } = await import('../components/PropertySpecIcon.tsx');
  for (const name of ['bed-outline', 'shower', 'sofa-outline', 'car', 'stairs', 'set-square'] as const) {
    const icon = PropertySpecIcon({ name, color: '#173F78', size: 24 });
    assert.equal(icon.type, 'Svg');
    assert.equal(icon.props.width, 24);
    assert.equal(icon.props.stroke, '#173F78');
    assert.equal(icon.props.accessible, false);
    const child = Array.isArray(icon.props.children) ? icon.props.children[0] : icon.props.children;
    assert.equal(child.type, 'Path');
    assert.ok(child.props.d.length > 0, name);
  }
});

test('Saved Property specifications never mount the additional icon-font family', async () => {
  const source = await readFile(resolveSourcePath('../app/property/[propertyCoreId].tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /MaterialCommunityIcons/);
  assert.match(source, /<PropertySpecIcon name=\{spec.icon\}/);
});
