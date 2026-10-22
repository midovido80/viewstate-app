import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

interface RouteHarness {
  language?: 'en' | 'ar';
  params: Record<string, string | undefined>;
  state: unknown[];
  cursor: number;
  pushes: Array<{ pathname: string; params?: Record<string, unknown> }>;
  navigations: Array<{ pathname: string; params?: Record<string, unknown> }>;
  setParamsCalls: Array<Record<string, unknown>>;
  draftUpdates: Array<Record<string, unknown>>;
  detailUpdates: Array<Record<string, unknown>>;
  captureDetails: Record<string, unknown>;
  router: {
    push: (destination: { pathname: string; params?: Record<string, unknown> }) => void;
    navigate: (destination: { pathname: string; params?: Record<string, unknown> }) => void;
    setParams: (params: Record<string, unknown>) => void;
    back: () => void;
  };
  capture: {
    draft: Record<string, unknown>;
    readonly captureDetails: Record<string, unknown>;
    updateDraft: (draft: Record<string, unknown>) => boolean;
    updateCaptureDetails: (details: Record<string, unknown>) => boolean;
    replaceCaptureDetails: (details: Record<string, unknown>) => boolean;
    getCurrentCaptureDetails: () => Record<string, unknown>;
  };
}

const stubSources = new Map<string, string>([
  ['react', `
    const createElement = (type, props, ...children) => ({
      type,
      props: {
        ...props,
        children: children.length > 1 ? children : children[0] ?? props?.children,
      },
    });
    const React = { createElement };
    globalThis.React = React;
    export { createElement };
    export default React;
    export const useState = initial => {
      const harness = globalThis.__apartmentRouteHarness;
      const index = harness.cursor++;
      if (!(index in harness.state)) harness.state[index] = typeof initial === 'function' ? initial() : initial;
      return [harness.state[index], next => {
        harness.state[index] = typeof next === 'function' ? next(harness.state[index]) : next;
      }];
    };
  `],
  ['react-native', `
    export const View = 'View';
    export const ScrollView = 'ScrollView';
    export const TouchableOpacity = 'TouchableOpacity';
    export const Modal = 'Modal';
    export const Text = 'Text';
    export const StyleSheet = { create: value => value };
  `],
  ['expo-router', `
    export const useLocalSearchParams = () => globalThis.__apartmentRouteHarness.params;
    export const useRouter = () => globalThis.__apartmentRouteHarness.router;
  `],
  ['react-native-safe-area-context', 'export const useSafeAreaInsets = () => ({ top: 0, bottom: 0 });'],
  ['@/contexts/CaptureContext', 'export const useCapture = () => globalThis.__apartmentRouteHarness.capture;'],
  ['@/contexts/I18nContext', `
    export const useI18n = () => ({
      t: key => key,
      fonts: { bold: 'bold', semiBold: 'semiBold' },
      isRTL: globalThis.__apartmentRouteHarness.language === 'ar',
      language: globalThis.__apartmentRouteHarness.language ?? 'en',
    });
  `],
  ['@/hooks/useColors', `
    export const useColors = () => ({
      background: '#fff', foreground: '#111', border: '#ddd',
    });
  `],
  ['@/components/CaptureHeader', "export const CaptureHeader = 'CaptureHeader';"],
  ['@/components/SelectCard', "export const SelectCard = 'SelectCard';"],
  ['@/components/ChoiceTile', "export const ChoiceCard = 'SelectCard'; export const ChoiceGrid = 'View';"],
  ['@/components/Button', "export const Button = 'Button';"],
  ['@workspace/property-domain', `
    export const PROPERTY_TYPES = ['whole_building', 'commercial_complex', 'apartment', 'floor', 'house', 'villa', 'office', 'shop', 'warehouse', 'chalet', 'other_built_property'];
    export const APARTMENT_SUBTYPES = ['studio', 'standard_apartment', 'duplex'];
    export { PROPERTY_DETAIL_FIELD_DEFINITIONS } from '${new URL('../../../lib/property-domain/src/taxonomy.ts', import.meta.url).href}';
  `],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!stubSources.has(specifier)) return nextResolve(specifier, context);
    return { url: `apartment-route-test:${encodeURIComponent(specifier)}`, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('apartment-route-test:')) return nextLoad(url, context);
    const specifier = decodeURIComponent(url.slice('apartment-route-test:'.length));
    return { format: 'module', source: stubSources.get(specifier), shortCircuit: true };
  },
});

const routeHarness = (params: RouteHarness['params'] = {}): RouteHarness => {
  const harness = {
    params: { ...params },
    state: [],
    cursor: 0,
    pushes: [],
    navigations: [],
    setParamsCalls: [],
    draftUpdates: [],
    detailUpdates: [],
    captureDetails: {},
  } as unknown as RouteHarness;
  harness.router = {
    push: destination => { harness.pushes.push(destination); },
    navigate: destination => { harness.navigations.push(destination); },
    setParams: nextParams => {
      harness.setParamsCalls.push(nextParams);
      Object.assign(harness.params, nextParams);
    },
    back: () => undefined,
  };
  harness.capture = {
    draft: {},
    get captureDetails() { return harness.captureDetails; },
    getCurrentCaptureDetails: () => harness.captureDetails,
    updateDraft: draft => {
      harness.draftUpdates.push(draft);
      return true;
    },
    updateCaptureDetails: details => {
      harness.detailUpdates.push(details);
      Object.assign(harness.captureDetails, details);
      return true;
    },
    replaceCaptureDetails: details => {
      harness.detailUpdates.push(details);
      harness.captureDetails = details;
      return true;
    },
  };
  return harness;
};

function renderRoute<T>(route: { default: () => T }, harness: RouteHarness): T {
  (globalThis as typeof globalThis & { __apartmentRouteHarness?: RouteHarness }).__apartmentRouteHarness = harness;
  harness.cursor = 0;
  return route.default();
}

function findByTestId(tree: unknown, testID: string): { props: Record<string, unknown> } {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      try {
        return findByTestId(child, testID);
      } catch {
        // Continue through sibling elements.
      }
    }
    throw new Error(`Missing testID ${testID}`);
  }
  if (!tree || typeof tree !== 'object') throw new Error(`Missing testID ${testID}`);
  const element = tree as { props?: Record<string, unknown> };
  if (element.props?.testID === testID) return element as { props: Record<string, unknown> };
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    try {
      return findByTestId(child, testID);
    } catch {
      // Continue through sibling elements.
    }
  }
  throw new Error(`Missing testID ${testID}`);
}

function findByType(tree: unknown, type: string): { props: Record<string, unknown> } {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      try {
        return findByType(child, type);
      } catch {
        // Continue through sibling elements.
      }
    }
    throw new Error(`Missing element ${type}`);
  }
  if (!tree || typeof tree !== 'object') throw new Error(`Missing element ${type}`);
  const element = tree as { type?: unknown; props?: Record<string, unknown> };
  if (element.type === type) return element as { props: Record<string, unknown> };
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    try {
      return findByType(child, type);
    } catch {
      // Continue through sibling elements.
    }
  }
  throw new Error(`Missing element ${type}`);
}

const flowContext = {
  mode: 'wanted',
  transaction: 'sale',
  seekerId: 'seeker-42',
  linkPersonId: 'person-42',
  sourceRole: 'broker',
};

test('production property type route enables Apartment Next and opens subtype selector with context', async () => {
  const route = await import('../app/capture/property-type.tsx');
  const harness = routeHarness(flowContext);
  const screen = renderRoute(route, harness);

  (findByTestId(screen, 'select-type-apartment').props.onSelect as () => void)();
  const afterApartmentTap = renderRoute(route, harness);
  const next = findByTestId(afterApartmentTap, 'btn-next');
  assert.equal(next.props.disabled, false);
  (next.props.onPress as () => void)();

  assert.equal(harness.pushes.length, 1);
  assert.equal(harness.pushes[0].pathname, '/capture/apartment-subtype');
  assert.deepEqual(harness.pushes[0].params, { ...flowContext, propertyType: 'apartment' });
  assert.deepEqual(harness.draftUpdates, []);
});

test('production Wanted chooser requires an explicit Rent or Buy choice and keeps the exact seeker', async () => {
  const transactionRoute = await import('../app/capture/transaction.tsx');
  const propertyTypeRoute = await import('../app/capture/property-type.tsx');
  const subtypeRoute = await import('../app/capture/apartment-subtype.tsx');

  for (const language of ['en', 'ar'] as const) for (const transaction of ['rent', 'sale'] as const) {
    const seekerId = `exact-seeker-${transaction}`;
    const transactionHarness = routeHarness({ mode: 'wanted', seekerId });
    transactionHarness.language = language;
    const initialTransaction = renderRoute(transactionRoute, transactionHarness);
    assert.equal(findByTestId(initialTransaction, 'btn-next').props.disabled, true);
    (findByTestId(initialTransaction, 'select-wanted').props.onSelect as () => void)();
    const selectedTransaction = renderRoute(transactionRoute, transactionHarness);
    assert.equal(findByTestId(selectedTransaction, 'select-sale').props.title, language === 'ar' ? 'للشراء' : 'To buy');
    assert.equal(findByTestId(selectedTransaction, 'select-rent').props.title, language === 'ar' ? 'للإيجار' : 'For rent');
    (findByTestId(selectedTransaction, transaction === 'rent' ? 'select-rent' : 'select-sale').props.onSelect as () => void)();
    (findByTestId(renderRoute(transactionRoute, transactionHarness), 'select-offered').props.onSelect as () => void)();
    const offeredTransaction = renderRoute(transactionRoute, transactionHarness);
    assert.equal(findByTestId(offeredTransaction, 'select-sale').props.title, language === 'ar' ? 'للبيع' : 'For sale');
    assert.equal(findByTestId(offeredTransaction, transaction === 'rent' ? 'select-rent' : 'select-sale').props.selected, true);
    (findByTestId(offeredTransaction, 'select-wanted').props.onSelect as () => void)();
    const wantedAgain = renderRoute(transactionRoute, transactionHarness);
    assert.equal(findByTestId(wantedAgain, 'select-sale').props.title, language === 'ar' ? 'للشراء' : 'To buy');
    assert.equal(findByTestId(wantedAgain, transaction === 'rent' ? 'select-rent' : 'select-sale').props.selected, true);
    (findByTestId(wantedAgain, 'btn-next').props.onPress as () => void)();

    assert.deepEqual(transactionHarness.pushes[0], {
      pathname: '/capture/property-type',
      params: { mode: 'wanted', transaction, seekerId },
    });

    const propertyHarness = routeHarness({ mode: 'wanted', transaction, seekerId });
    const propertyScreen = renderRoute(propertyTypeRoute, propertyHarness);
    assert.equal(findByTestId(propertyScreen, 'btn-next').props.disabled, true);
    (findByTestId(propertyScreen, 'select-type-apartment').props.onSelect as () => void)();
    (findByTestId(renderRoute(propertyTypeRoute, propertyHarness), 'btn-next').props.onPress as () => void)();
    assert.deepEqual(propertyHarness.pushes[0], {
      pathname: '/capture/apartment-subtype',
      params: { mode: 'wanted', transaction, seekerId, propertyType: 'apartment' },
    });

    const subtypeHarness = routeHarness({ mode: 'wanted', transaction, seekerId, propertyType: 'apartment' });
    const subtypeScreen = renderRoute(subtypeRoute, subtypeHarness);
    assert.equal(findByTestId(subtypeScreen, 'btn-next').props.disabled, true);
    (findByTestId(subtypeScreen, 'select-apartment-standard').props.onSelect as () => void)();
    (findByTestId(renderRoute(subtypeRoute, subtypeHarness), 'btn-next').props.onPress as () => void)();
    assert.deepEqual(subtypeHarness.pushes[0], {
      pathname: '/requirement/new',
      params: {
        mode: 'wanted',
        transaction,
        seekerId,
        propertyType: 'apartment',
        apartmentSubtype: 'standard',
        purpose: transaction === 'sale' ? 'buy' : 'rent',
      },
    });
  }
});

test('production wanted Apartment Studio selection uses its dedicated route with the exact seeker', async () => {
  const route = await import('../app/capture/apartment-subtype.tsx');
  const seekerId = 'seeker-studio-exact';
  const harness = routeHarness({ mode: 'wanted', transaction: 'sale', seekerId, propertyType: 'apartment' });
  const screen = renderRoute(route, harness);
  (findByTestId(screen, 'select-apartment-studio').props.onSelect as () => void)();
  (findByTestId(renderRoute(route, harness), 'btn-next').props.onPress as () => void)();

  assert.deepEqual(harness.pushes[0], {
    pathname: '/capture/studio',
    params: {
      mode: 'wanted',
      transaction: 'sale',
      seekerId,
      propertyType: 'apartment',
      apartmentSubtype: 'studio',
    },
  });
});

test('production wanted property type has no inherited draft type or transaction defaults', async () => {
  const route = await import('../app/capture/property-type.tsx');
  const harness = routeHarness({ mode: 'wanted', seekerId: 'exact-seeker' });
  harness.capture.draft = { propertyType: 'villa', transaction: 'rent' };
  const screen = renderRoute(route, harness);
  assert.equal(findByTestId(screen, 'btn-next').props.disabled, true);
  assert.equal(findByTestId(screen, 'select-type-villa').props.selected, false);
});

test('production subtype route sends Studio to dedicated capture and preserves Person context on Back', async () => {
  const route = await import('../app/capture/apartment-subtype.tsx');
  const harness = routeHarness({ ...flowContext, propertyType: 'apartment' });
  const initial = renderRoute(route, harness);
  assert.equal(findByTestId(initial, 'btn-next').props.disabled, true);

  (findByTestId(initial, 'select-apartment-studio').props.onSelect as () => void)();
  const selected = renderRoute(route, harness);
  (findByTestId(selected, 'btn-next').props.onPress as () => void)();
  assert.deepEqual(harness.pushes[0], {
    pathname: '/capture/studio',
    params: { ...flowContext, propertyType: 'apartment', apartmentSubtype: 'studio' },
  });

  const back = findByType(selected, 'CaptureHeader');
  (back.props.onBack as () => void)();
  assert.deepEqual(harness.navigations[0], {
    pathname: '/capture/property-type',
    params: {
      ...flowContext,
      propertyType: 'apartment',
      apartmentSubtype: 'studio',
    },
  });
});

test('production subtype route keeps Standard on existing offered and wanted destinations', async () => {
  const route = await import('../app/capture/apartment-subtype.tsx');
  const offered = routeHarness({ ...flowContext, mode: 'offered', transaction: 'rent', propertyType: 'apartment' });
  const offeredScreen = renderRoute(route, offered);
  (findByTestId(offeredScreen, 'select-apartment-standard').props.onSelect as () => void)();
  (findByTestId(renderRoute(route, offered), 'btn-next').props.onPress as () => void)();
  assert.deepEqual(offered.draftUpdates, [{
    propertyType: 'apartment',
    apartmentSubtype: 'standard_apartment',
    transaction: 'rent',
  }]);
  assert.deepEqual(offered.detailUpdates, [{ apartmentSubtype: 'standard_apartment' }]);
  assert.equal(offered.captureDetails.apartmentSubtype, 'standard_apartment');
  assert.deepEqual(offered.pushes[0], {
    pathname: '/capture/price',
    params: {
      mode: 'offered',
      transaction: 'rent',
      seekerId: 'seeker-42',
      linkPersonId: 'person-42',
      sourceRole: 'broker',
      propertyType: 'apartment',
      apartmentSubtype: 'standard',
    },
  });

  const wanted = routeHarness({ ...flowContext, transaction: 'rent', propertyType: 'apartment' });
  const wantedScreen = renderRoute(route, wanted);
  (findByTestId(wantedScreen, 'select-apartment-standard').props.onSelect as () => void)();
  (findByTestId(renderRoute(route, wanted), 'btn-next').props.onPress as () => void)();
  assert.deepEqual(wanted.detailUpdates, []);
  assert.deepEqual(wanted.pushes[0], {
    pathname: '/requirement/new',
    params: {
      ...flowContext,
      transaction: 'rent',
      propertyType: 'apartment',
      apartmentSubtype: 'standard',
      purpose: 'rent',
    },
  });
});

test('production property type route clears stale subtype and Floor use when changing away from Apartment', async () => {
  const route = await import('../app/capture/property-type.tsx');
  const harness = routeHarness({
    ...flowContext,
    propertyType: 'apartment',
    apartmentSubtype: 'standard',
  });
  const screen = renderRoute(route, harness);
  (findByTestId(screen, 'select-type-villa').props.onSelect as () => void)();

  assert.deepEqual(harness.setParamsCalls[0], {
    propertyType: 'villa',
    floorUse: undefined,
    apartmentSubtype: undefined,
  });
  assert.equal(harness.params.mode, 'wanted');
  assert.equal(harness.params.transaction, 'sale');
  assert.equal(harness.params.seekerId, 'seeker-42');
  assert.equal(harness.params.linkPersonId, 'person-42');
  assert.equal(harness.params.sourceRole, 'broker');
  (findByTestId(renderRoute(route, harness), 'btn-next').props.onPress as () => void)();
  assert.deepEqual(harness.pushes[0], {
    pathname: '/requirement/new',
    params: {
      ...flowContext,
      propertyType: 'villa',
      purpose: 'buy',
    },
  });
});

test('production Offered Floor selection opens the existing floor form and preserves only shared capture data', async () => {
  const route = await import('../app/capture/property-type.tsx');
  const harness = routeHarness({ mode: 'offered', transaction: 'rent', propertyType: 'floor', apartmentSubtype: 'studio', sector: 'commercial' });
  harness.capture.draft = { propertyType: 'apartment', transaction: 'rent' };
  harness.captureDetails = {
    apartmentSubtype: 'studio',
    bedroomCount: '2',
    areaSquareMeters: 120,
    mapsLink: 'https://maps.example.test/?q=1',
    attachments: [{ id: 'private-evidence' }],
  };
  const screen = renderRoute(route, harness);
  (findByTestId(screen, 'btn-next').props.onPress as () => void)();

  assert.deepEqual(harness.draftUpdates, [{ propertyType: 'floor', apartmentSubtype: undefined, transaction: 'rent' }]);
  assert.deepEqual(harness.captureDetails, {
    floorUse: 'commercial',
    areaSquareMeters: 120,
    mapsLink: 'https://maps.example.test/?q=1',
    attachments: [{ id: 'private-evidence' }],
  });
  assert.deepEqual(harness.pushes[0], {
    pathname: '/capture',
    params: { mode: 'offered', transaction: 'rent', propertyType: 'floor', floorUse: 'commercial' },
  });
});


test('production sector filters toggle back to All and clear a hidden type', async () => {
  const route = await import('../app/capture/property-type.tsx');
  const harness = routeHarness({ mode: 'wanted', transaction: 'rent' });
  let screen = renderRoute(route, harness);
  assert.equal((findByTestId(screen, 'property-sector-all').props.accessibilityState as { selected: boolean }).selected, true);
  (findByTestId(screen, 'select-type-villa').props.onSelect as () => void)();
  screen = renderRoute(route, harness);
  (findByTestId(screen, 'property-sector-commercial').props.onPress as () => void)();
  screen = renderRoute(route, harness);
  assert.throws(() => findByTestId(screen, 'select-type-villa'));
  assert.throws(() => findByTestId(screen, 'select-type-duplex'));
  assert.equal(findByTestId(screen, 'btn-next').props.disabled, true);
  (findByTestId(screen, 'property-sector-commercial').props.onPress as () => void)();
  screen = renderRoute(route, harness);
  assert.equal((findByTestId(screen, 'property-sector-all').props.accessibilityState as { selected: boolean }).selected, true);
  findByTestId(screen, 'select-type-duplex');
});

test('production Wanted Floor gets its use before the form for both transactions', async () => {
  const route = await import('../app/capture/property-type.tsx');
  for (const transaction of ['sale', 'rent']) for (const sector of ['commercial', 'residential']) {
    const harness = routeHarness({ ...flowContext, transaction, sector });
    (findByTestId(renderRoute(route, harness), `select-type-${sector}_floor`).props.onSelect as () => void)();
    const screen = renderRoute(route, harness);
    assert.throws(() => findByTestId(screen, 'property-floor-use-selection'));
    (findByTestId(screen, 'btn-next').props.onPress as () => void)();
    assert.equal(harness.pushes[0].params?.floorUse, sector);
    assert.equal(harness.pushes[0].params?.seekerId, flowContext.seekerId);
    assert.equal(harness.pushes[0].params?.purpose, transaction === 'sale' ? 'buy' : 'rent');
  }
});

test('production All exposes both named Floor choices and opens the correct form without another use selection', async () => {
  const route = await import('../app/capture/property-type.tsx');
  for (const mode of ['offered', 'wanted']) for (const transaction of ['sale', 'rent']) for (const use of ['residential', 'commercial']) {
    const harness = routeHarness({ mode, transaction });
    let screen = renderRoute(route, harness);
    findByTestId(screen, 'select-type-residential_floor');
    findByTestId(screen, 'select-type-commercial_floor');
    assert.throws(() => findByTestId(screen, 'select-type-floor'));
    (findByTestId(screen, `select-type-${use}_floor`).props.onSelect as () => void)();
    screen = renderRoute(route, harness);
    assert.equal(findByTestId(screen, 'btn-next').props.disabled, false);
    assert.throws(() => findByTestId(screen, 'property-floor-use-selection'));
    (findByTestId(screen, 'btn-next').props.onPress as () => void)();
    assert.equal(harness.pushes[0].pathname, mode === 'wanted' ? '/requirement/new' : '/capture');
    assert.equal(harness.pushes[0].params?.propertyType, 'floor');
    assert.equal(harness.pushes[0].params?.floorUse, use);
    if (mode === 'offered') assert.equal(harness.captureDetails.floorUse, use);
  }
});

test('production selector restores the exact named Floor from canonical Back parameters', async () => {
  const route = await import('../app/capture/property-type.tsx');
  for (const use of ['residential', 'commercial']) {
    const harness = routeHarness({ mode: 'wanted', transaction: 'rent', propertyType: 'floor', floorUse: use, sector: 'all' });
    const screen = renderRoute(route, harness);
    assert.equal(findByTestId(screen, `select-type-${use}_floor`).props.selected, true);
    assert.equal(findByTestId(screen, 'btn-next').props.disabled, false);
    (findByTestId(screen, 'btn-next').props.onPress as () => void)();
    assert.equal(harness.pushes[0].params?.floorUse, use);
  }
});

test('production sector changes hide and clear the opposite named Floor', async () => {
  const route = await import('../app/capture/property-type.tsx');
  const harness = routeHarness({ mode: 'wanted', transaction: 'rent' });
  (findByTestId(renderRoute(route, harness), 'select-type-residential_floor').props.onSelect as () => void)();
  (findByTestId(renderRoute(route, harness), 'property-sector-commercial').props.onPress as () => void)();
  const screen = renderRoute(route, harness);
  assert.throws(() => findByTestId(screen, 'select-type-residential_floor'));
  findByTestId(screen, 'select-type-commercial_floor');
  assert.equal(findByTestId(screen, 'btn-next').props.disabled, true);
});

test('production direct Duplex bypasses the Apartment subtype page', async () => {
  const route = await import('../app/capture/property-type.tsx');
  const harness = routeHarness(flowContext);
  (findByTestId(renderRoute(route, harness), 'select-type-duplex').props.onSelect as () => void)();
  (findByTestId(renderRoute(route, harness), 'btn-next').props.onPress as () => void)();
  assert.equal(harness.pushes[0].pathname, '/requirement/new');
  assert.equal(harness.pushes[0].params?.propertyType, 'apartment');
  assert.equal(harness.pushes[0].params?.apartmentSubtype, 'duplex');
});

test('production sector Floor transition preserves the old draft until confirmation', async () => {
  const route = await import('../app/capture/property-type.tsx');
  const harness = routeHarness({ mode: 'offered', transaction: 'rent', sector: 'commercial', propertyType: 'floor' });
  harness.capture.draft = { propertyType: 'floor', transaction: 'rent' };
  harness.captureDetails = { floorUse: 'residential', bedroomCount: '3', mapsLink: 'https://example.test/map' };
  (findByTestId(renderRoute(route, harness), 'btn-next').props.onPress as () => void)();
  assert.equal(harness.pushes.length, 0);
  assert.equal(harness.captureDetails.bedroomCount, '3');
  (findByTestId(renderRoute(route, harness), 'sector-floor-transition-confirm').props.onPress as () => void)();
  assert.equal(harness.captureDetails.floorUse, 'commercial');
  assert.equal(harness.captureDetails.bedroomCount, undefined);
  assert.equal(harness.captureDetails.mapsLink, 'https://example.test/map');
  assert.equal(harness.pushes[0].pathname, '/capture');
});
