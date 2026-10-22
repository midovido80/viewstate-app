import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { choiceTileWidth } from '../services/choicePresentation.ts';

const state = { rtl: false, fontScale: 1, platform: 'web', capture: undefined as any, router: undefined as any, params: {} as any, width: 148, measured: undefined as number | undefined };
(globalThis as any).__choiceGridTest = state;
const stubs = new Map([
  ['react', `
    const createElement = (type, props, ...children) => ({ type, props: { ...props, children: children.length > 1 ? children : children[0] ?? props?.children } });
    const React = { createElement }; globalThis.React = React; export default React;
    export { createElement }; export const forwardRef = render => render; export const createContext = value => ({ Provider: 'Provider' });
    export const useContext = () => globalThis.__choiceGridTest.width;
    export const useState = initial => [initial, value => { globalThis.__choiceGridTest.measured = value; }];
  `],
  ['react/jsx-runtime', `export const Fragment = 'Fragment'; export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx;`],
  ['react-native', `export const useWindowDimensions = () => ({ width: 390, height: 844, fontScale: globalThis.__choiceGridTest.fontScale }); export const Platform = { get OS() { return globalThis.__choiceGridTest.platform; } }; export const ScrollView = 'ScrollView'; export const ActivityIndicator = 'ActivityIndicator'; export const View = 'View'; export const Text = 'Text'; export const TextInput = 'TextInput'; export const TouchableOpacity = 'TouchableOpacity'; export const StyleSheet = { create: value => value };`],
  ['@expo/vector-icons', `export const Feather = 'Feather';`],
  ['react-native-keyboard-controller', `export const KeyboardAwareScrollView = 'NativeKeyboardAwareScrollView';`],
  ['@/hooks/useScreenInsets', `export const useScreenInsets = () => ({ top: 32, bottom: 36, left: 0, right: 0 });`],
  ['@/components/CaptureHeader', `export const CaptureHeader = 'CaptureHeader';`],
  ['@/components/KuwaitAreaSelector', `export const KuwaitAreaSelector = 'KuwaitAreaSelector';`],
  ['@/contexts/CaptureContext', `export const useCapture = () => globalThis.__choiceGridTest.capture;`],
  ['expo-router', `export const useLocalSearchParams = () => globalThis.__choiceGridTest.params; export const useRouter = () => globalThis.__choiceGridTest.router;`],

  ['@/hooks/useColors', `export const useColors = () => ({ card: '#fff', foreground: '#111', border: '#ddd', primary: '#1A56FF', background: '#F7F8FB', mutedForeground: '#64748B' });`],
  ['@/contexts/I18nContext', `export const useI18n = () => ({ isRTL: globalThis.__choiceGridTest.rtl, language: globalThis.__choiceGridTest.rtl ? 'ar' : 'en', fonts: { medium: 'medium', semiBold: 'bold', bold: 'bold' }, t: key => key });`],
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

const loadComponents = () => Promise.all([import('../components/ChoiceTile.tsx'), import('../components/PropertyEnrichmentFields.tsx')]);
const props = (element: any) => element.props;
function elements(element: any): any[] {
  if (Array.isArray(element)) return element.flatMap(elements);
  return element && typeof element === 'object' && 'props' in element ? [element, ...elements(element.props.children)] : [];
}

test('Choice grids fit two equal columns after measurement at narrow, phone and tablet widths', async () => {
  const [tiles, { PropertyEnrichmentFields }] = await loadComponents();
  for (const width of [240, 280, 320, 350, 362, 728]) {
    const grid = tiles.ChoiceGrid({ children: null });
    props(grid).onLayout({ nativeEvent: { layout: { width } } });
    assert.equal(state.measured, choiceTileWidth(width));
    assert.equal(state.measured! * 2 + 8, width);
  }
  assert.equal(choiceTileWidth(0), undefined);
  assert.equal(choiceTileWidth(NaN), undefined);
});

test('Editable tiles retain radio/checkbox semantics, full labels and exactly one press callback in both directions', async () => {
  const [tiles, { PropertyEnrichmentFields }] = await loadComponents();
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

test('Saved choice facts contain no input role, selection indicator or press action', async () => {
  const [tiles, { PropertyEnrichmentFields }] = await loadComponents();
  const fact = tiles.ChoiceFact({ label: 'بلكونة' });
  assert.equal(props(fact).onPress, undefined);
  assert.equal(props(fact).accessibilityRole, undefined);
  assert.equal(elements(fact).some(item => item.props.name === 'check'), false);
});

test('Amenity taps select or clear a fact while historical false is readable and other fields stay untouched', async () => {
  const [tiles, { PropertyEnrichmentFields }] = await loadComponents();
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


test('Area and Block stay in reading order, share a row, and stack for enlarged system text', async () => {
  const { PropertyAreaBlockRow } = await import('../components/PropertyFormCard.tsx');
  for (const rtl of [false, true]) {
    state.rtl = rtl;
    state.fontScale = 1;
    const row = PropertyAreaBlockRow({ area: 'area-control', block: 'block-control' });
    assert.equal(row.props.style.flexDirection, rtl ? 'row-reverse' : 'row');
    assert.equal(row.props.children[0].props.children, 'area-control');
    assert.equal(row.props.children[1].props.children, 'block-control');
    assert.equal(row.props.children[0].props.style.flex, 2);
    state.fontScale = 1.6;
    assert.equal(PropertyAreaBlockRow({ area: 'area', block: 'block' }).props.style.flexDirection, 'column');
  }
  state.fontScale = 1;
});

test('Form cards do not add press handlers or alter their field controls', async () => {
  const { PropertyFormCard } = await import('../components/PropertyFormCard.tsx');
  const control = { type: 'TextInput', key: null, props: { value: '500', onChangeText: () => undefined } };
  const card = PropertyFormCard({ title: 'المواصفات', children: control });
  assert.equal(card.props.onPress, undefined);
  assert.equal(card.props.children[1], control);
});


test('Action buttons keep one native press target across loading and disabled transitions', async () => {
  const { Button } = await import('../components/Button.tsx');
  let presses = 0;
  const active = Button({ title: 'Save details', onPress: () => presses++ });
  const busy = Button({ title: 'Save details', onPress: () => presses++, loading: true });
  const disabled = Button({ title: 'Save details', onPress: () => presses++, disabled: true });
  assert.equal(active.type, busy.type);
  assert.equal(active.type, disabled.type);
  assert.equal(busy.props.disabled, true);
  assert.equal(disabled.props.accessibilityState.disabled, true);
  active.props.onPress();
  assert.equal(presses, 1);
});

test('Native scroll viewport preserves refs, input taps and scrolling while keeping its height bounded', async () => {
  const { KeyboardAwareScrollViewCompat } = await import('../components/KeyboardAwareScrollViewCompat.tsx');
  for (const platform of ['web', 'android', 'ios']) {
    state.platform = platform;
    const ref = { current: null };
    const view = (KeyboardAwareScrollViewCompat as any)({ children: 'fields', bottomOffset: 80, style: { backgroundColor: '#fff' } }, ref);
    assert.equal(view.type, platform === 'web' ? 'ScrollView' : 'NativeKeyboardAwareScrollView');
    assert.equal(view.props.ref, ref);
    assert.equal(view.props.removeClippedSubviews, false);
    assert.equal(view.props.keyboardShouldPersistTaps, 'handled');
    assert.equal(view.props.style[0].flex, 1);
    assert.equal(view.props.style[0].minHeight, 0);
  }
  state.platform = 'web';
});

test('Basic capture requires area and price, then reviews the same draft with Person context intact', async () => {
  const { default: PriceScreen } = await import('../app/capture/price.tsx');
  for (const transaction of ['rent', 'sale']) {
    const pushes: any[] = [];
    const draft: any = { transaction, propertyType: 'apartment', block: '3', rentalPeriodId: 'monthly' };
    state.params = { linkPersonId: 'person-1', sourceRole: 'owner', apartmentSubtype: 'duplex' };
    state.router = { push: (route: any) => pushes.push(route) };
    state.capture = { draft, isReady: true, updateDraft: (next: any) => Object.assign(draft, next) };
    const next = () => elements(PriceScreen()).find(item => item.props.testID === 'btn-next')!.props.onPress();
    next();
    assert.equal(pushes.length, 0);
    draft[transaction === 'rent' ? 'rentalPrice' : 'salePrice'] = { amount: 500, currencyCode: 'KWD' };
    next();
    assert.equal(pushes.length, 0, 'valid price alone cannot skip the area');
    draft.locationAreaId = 'KW-HA-SALMIYA';
    next();
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].pathname, '/capture/summary');
    assert.deepEqual(pushes[0].params, state.params);
    assert.equal(draft.block, '3');
    if (transaction === 'rent') assert.equal(draft.rentalPeriodId, 'monthly');
  }
});
