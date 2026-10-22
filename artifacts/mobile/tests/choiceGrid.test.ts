import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { choiceTileWidth } from '../services/choicePresentation.ts';

const state = { rtl: false, width: 148, measured: undefined as number | undefined };
(globalThis as any).__choiceGridTest = state;
const stubs = new Map([
  ['react', `
    const createElement = (type, props, ...children) => ({ type, props: { ...props, children: children.length > 1 ? children : children[0] ?? props?.children } });
    const React = { createElement }; globalThis.React = React; export default React;
    export { createElement }; export const createContext = value => ({ Provider: 'Provider' });
    export const useContext = () => globalThis.__choiceGridTest.width;
    export const useState = initial => [initial, value => { globalThis.__choiceGridTest.measured = value; }];
  `],
  ['react/jsx-runtime', `export const Fragment = 'Fragment'; export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx;`],
  ['react-native', `export const View = 'View'; export const Text = 'Text'; export const TextInput = 'TextInput'; export const TouchableOpacity = 'TouchableOpacity'; export const StyleSheet = { create: value => value };`],
  ['@expo/vector-icons', `export const Feather = 'Feather';`],
  ['@/hooks/useColors', `export const useColors = () => ({ card: '#fff', foreground: '#111', border: '#ddd' });`],
  ['@/contexts/I18nContext', `export const useI18n = () => ({ isRTL: globalThis.__choiceGridTest.rtl, language: globalThis.__choiceGridTest.rtl ? 'ar' : 'en', fonts: { medium: 'medium', semiBold: 'bold' }, t: key => key });`],
  ['@workspace/property-domain', `export const APARTMENT_SUBTYPES = []; export const FURNISHING_VALUES = [];`],
  ['@/components/NumericQuickPick', `export const NumericQuickPick = 'NumericQuickPick';`],
  ['@/services/numericQuickPick', `export const FLOOR_NUMBER_QUICK_PICK_VALUES = []; export const isPropertyNumericQuickPickSurface = () => true;`],
  ['@/services/propertyDetailPresentation', `export const propertyDetailLabels = { hasBalcony: ['Balcony', 'بلكونة'] }; export const propertyDetailDisplayDefinitions = []; export const RESIDENTIAL_AMENITY_PROPERTY_FIELDS = []; export const formatPropertyDetailValue = () => '';`],
  ['@/services/propertyFormCatalog', `export const getApplicablePropertyFormFields = () => [{ field: 'hasBalcony', control: 'boolean', group: 'amenity' }];`],
]);
registerHooks({
  resolve(specifier, context, next) {
    return stubs.has(specifier) ? { url: `choice-test:${encodeURIComponent(specifier)}`, shortCircuit: true } : next(specifier, context);
  },
  load(url, context, next) {
    return url.startsWith('choice-test:') ? { format: 'module', source: stubs.get(decodeURIComponent(url.slice('choice-test:'.length)))!, shortCircuit: true } : next(url, context);
  },
});

const tiles = await import('../components/ChoiceTile.tsx');
const { PropertyEnrichmentFields } = await import('../components/PropertyEnrichmentFields.tsx');
const props = (element: any) => element.props;
function elements(element: any): any[] {
  if (Array.isArray(element)) return element.flatMap(elements);
  return element && typeof element === 'object' && 'props' in element ? [element, ...elements(element.props.children)] : [];
}

test('Choice grids fit two equal columns after measurement at narrow, phone and tablet widths', () => {
  for (const width of [240, 280, 320, 350, 362, 728]) {
    const grid = tiles.ChoiceGrid({ children: null });
    props(grid).onLayout({ nativeEvent: { layout: { width } } });
    assert.equal(state.measured, choiceTileWidth(width));
    assert.equal(state.measured! * 2 + 8, width);
  }
  assert.equal(choiceTileWidth(0), undefined);
  assert.equal(choiceTileWidth(NaN), undefined);
});

test('Editable tiles retain radio/checkbox semantics, full labels and exactly one press callback in both directions', () => {
  for (const rtl of [false, true]) {
    state.rtl = rtl;
    for (const role of ['radio', 'checkbox'] as const) {
      let presses = 0;
      const tile = tiles.ChoiceTile({ label: '✓ جمعية / سوبرماركت', selected: true, role, onPress: () => presses++ });
      assert.equal(props(tile).accessibilityRole, role);
      assert.deepEqual(props(tile).accessibilityState, { checked: true });
      assert.equal(props(tile).accessibilityLabel, 'جمعية / سوبرماركت');
      props(tile).onPress();
      assert.equal(presses, 1);
      assert.equal(props(tile).style.at(-1).width, 148);
      assert.equal(props(tile).style.at(-1).flexDirection, rtl ? 'row-reverse' : 'row');
    }
  }
});

test('Saved choice facts contain no input role, selection indicator or press action', () => {
  const fact = tiles.ChoiceFact({ label: 'بلكونة' });
  assert.equal(props(fact).onPress, undefined);
  assert.equal(props(fact).accessibilityRole, undefined);
  assert.equal(elements(fact).some(item => item.props.name === 'check'), false);
});

test('Amenity taps select or clear a fact while historical false is readable and other fields stay untouched', () => {
  for (const initial of ['', 'true', 'false']) {
    const changes: unknown[] = [];
    const form = PropertyEnrichmentFields({ recordScopeKey: 'test', propertyType: 'apartment', values: { hasBalcony: initial, bedroomCount: '3' }, onChange: (field, value) => changes.push([field, value]) });
    const tile = elements(form).find(item => item.type === tiles.ChoiceTile)!;
    assert.ok(tile);
    assert.equal(props(tile).selected, initial !== '');
    if (initial === 'false') assert.match(props(tile).label, /بدون|No /);
    props(tile).onPress();
    assert.deepEqual(changes, [['hasBalcony', initial ? '' : 'true']]);
  }
});
