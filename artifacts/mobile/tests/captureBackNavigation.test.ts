import test from 'node:test';
import assert from 'node:assert/strict';
import { getCaptureBackAction } from '../services/captureBackNavigation.ts';

const context = { mode: 'offered' as const, transaction: 'rent' as const, linkPersonId: 'person / exact', sourceRole: 'broker' };

test('Back from an Offered form uses history, never the embedded legacy category step', () => {
  assert.deepEqual(getCaptureBackAction(2, true, context), { kind: 'back' });
  assert.deepEqual(getCaptureBackAction(1, true, context), { kind: 'back' });
});

test('Preview Back returns to editing even when no navigation history exists', () => {
  for (const history of [true, false]) assert.deepEqual(getCaptureBackAction(3, history, context), { kind: 'edit' });
});

test('Direct form entry without history returns to the canonical selector with exact context', () => {
  assert.deepEqual(getCaptureBackAction(2, false, context), {
    kind: 'select-type',
    route: { pathname: '/capture/property-type', params: { ...context } },
  });
});

test('Back planning leaves the current draft and context unchanged for rent and sale', () => {
  for (const transaction of ['rent', 'sale'] as const) {
    const value = Object.freeze({ ...context, transaction });
    const before = { ...value };
    getCaptureBackAction(2, true, value);
    getCaptureBackAction(3, false, value);
    assert.deepEqual(value, before);
  }
});

test('Wanted specifications Back leaves the new flow; legacy editing keeps its local catalog step', async () => {
  const { readFile } = await import('node:fs/promises');
  const ts = (await import('typescript')).default;
  const source = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  const start = source.indexOf('  const previousStep = () => {');
  const end = source.indexOf('  const changeApartmentSubtype', start);
  assert.ok(start >= 0 && end > start);
  const compiled = ts.transpileModule(source.slice(start, end) + '\nreturn previousStep;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const run = (editing: boolean, history: boolean, step: number) => {
    const calls: unknown[] = [];
    const router = { canGoBack: () => history, back: () => calls.push('back'), replace: (value: unknown) => calls.push(value) };
    const factory = new Function('editing', 'hasExplicitCatalogSelection', 'startsAtSpecifications', 'step', 'router', 'setError', 'setShowCatalogBackControls', 'setStep', 'purpose', 'propertyType', 'ownerFromRoute', 'floorUse', compiled);
    const handler = factory(editing, true, true, step, router, () => {}, (value: unknown) => calls.push(['catalog', value]), (value: unknown) => calls.push(['step', value]), 'rent', 'floor', 'person / exact', 'commercial');
    handler();
    return calls;
  };
  assert.deepEqual(run(false, true, 3), ['back']);
  assert.deepEqual(run(false, false, 3), [{ pathname: '/capture/property-type', params: { mode: 'wanted', transaction: 'rent', propertyType: 'floor', seekerId: 'person / exact', sector: 'commercial', floorUse: 'commercial' } }]);
  assert.deepEqual(run(true, true, 3), [['catalog', true], ['step', 1]]);
  const later = run(false, true, 4);
  assert.equal(later.length, 1);
  const update = (later[0] as [string, (step: number) => number])[1];
  assert.equal(update(4), 3);
});
