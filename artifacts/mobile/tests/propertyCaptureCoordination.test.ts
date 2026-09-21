import assert from 'node:assert/strict';
import test from 'node:test';
import { projectDraftToProperty, type Property } from '@workspace/property-domain';
import {
  applyCaptureTransactionDefaults,
  buildPropertyWithCaptureDetails,
  captureDetailsScopeKey,
} from '@/services/propertyCaptureDetails';
import {
  finalizeCapturedDetails,
  loadPreparedCapturedDetails,
  persistCapturedDetails,
  prepareCapturedDetails,
  recoverPreparedCapturedDetails,
  CAPTURE_DETAILS_POINTER_KEY,
} from '@/services/propertyCaptureSave';
import {
  clearCaptureDetails,
  flushCaptureDetailsWrites,
  saveCaptureDetails,
} from '@/services/captureDetailsStorage';

class MemoryStorage {
  private values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

const baseline = {
  core: {
    id: 'property-capture-test',
    propertyType: 'floor' as const,
    locationArea: { id: 'salmiya' },
  },
  activeOffer: {
    id: 'offer-capture-test',
    propertyCoreId: 'property-capture-test',
    transaction: 'rent' as const,
    rentalPrice: { amount: 800, currencyCode: 'KWD' },
    rentalPeriodId: 'monthly',
  },
};

test('BEHAVIOR: BASIC projection rejects missing required capture data', () => {
  const result = projectDraftToProperty({
    propertyCoreId: 'p',
    offerId: 'o',
    propertyType: 'floor',
    transaction: 'rent',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some(issue => issue.code === 'required'));
});

test('BEHAVIOR: fresh Rent draft applies monthly cadence without inventing values', () => {
  const changes = applyCaptureTransactionDefaults(
    { propertyCoreId: 'p', offerId: 'o' },
    { transaction: 'rent' },
    'fresh',
  );
  assert.equal(changes.rentalPeriodId, 'monthly');
  assert.equal(changes.salePrice, undefined);
});

test('BEHAVIOR: one capture target combines BASIC and optional applicable details', () => {
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'commercial',
    builtUpAreaSquareMeters: '250',
    bathroomCount: '2',
    commercialActivity: 'retail',
    ceilingHeightMeters: '4',
  });
  assert.deepEqual(candidate.typeDetails, {
    propertyType: 'floor',
    floorUse: 'commercial',
    builtUpAreaSquareMeters: 250,
    bathroomCount: 2,
    commercialActivity: {
      value: 'retail',
      privacy: { classification: 'normal', disclosurePolicy: 'normal' },
    },
    ceilingHeightMeters: 4,
  });
  assert.equal(candidate.activeOffer.transaction, 'rent');
  if (candidate.activeOffer.transaction === 'rent') {
    assert.equal(candidate.activeOffer.rentalPeriodId, 'monthly');
  }
});

test('BEHAVIOR: Floor transition scopes are record-owned for stale protection', () => {
  assert.equal(captureDetailsScopeKey('property-capture-test'), 'capture:property-capture-test');
  assert.notEqual(captureDetailsScopeKey('property-a'), captureDetailsScopeKey('property-b'));
});

test('BEHAVIOR: incompatible detail values are omitted from the candidate', () => {
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'commercial',
    bedroomCount: '3',
  });
  assert.equal((candidate.typeDetails as unknown as Record<string, unknown>).bedroomCount, undefined);
});

test('BEHAVIOR: capture detail CAS success clears evidence after stored round trip', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'commercial',
    bathroomCount: '3',
  });
  let stored: Property = baseline;
  await persistCapturedDetails({
    compareAndUpdate: async (from, to) => {
      assert.deepEqual(from, baseline);
      stored = to;
      return true;
    },
  }, baseline, candidate, storage);
  assert.deepEqual(stored, candidate);
  assert.equal(await loadPreparedCapturedDetails(baseline.core.id, storage), null);
});

test('BEHAVIOR: failed capture CAS retains restartable enrichment evidence', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'commercial',
    bathroomCount: '4',
  });
  const evidence = await prepareCapturedDetails(baseline, candidate, storage);
  assert.ok(evidence);
  await assert.rejects(
    finalizeCapturedDetails({
      compareAndUpdate: async () => false,
    }, evidence!, storage),
    /CAPTURE_DETAILS_PROPERTY_CHANGED/,
  );
  assert.deepEqual(
    await loadPreparedCapturedDetails(baseline.core.id, storage),
    evidence,
  );
});

test('BEHAVIOR: prepared details survive BASIC completion and finalize after restart', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'residential',
    bedroomCount: '3',
    bathroomCount: '2',
  });
  await prepareCapturedDetails(baseline, candidate, storage);

  const recovered = await loadPreparedCapturedDetails(baseline.core.id, storage);
  assert.ok(recovered);
  let stored: Property = baseline;
  await finalizeCapturedDetails({
    compareAndUpdate: async (from, to) => {
      assert.deepEqual(from, stored);
      stored = to;
      return true;
    },
  }, recovered!, storage);

  assert.deepEqual(stored, candidate);
  assert.equal(await loadPreparedCapturedDetails(baseline.core.id, storage), null);
});

test('BEHAVIOR: capture detail storage serializes updates and rejects stale cleanup', async () => {
  const storage = new MemoryStorage();
  const first = { floorUse: 'residential', bedroomCount: '2' } as const;
  const second = { floorUse: 'residential', bedroomCount: '3' } as const;
  assert.equal(await saveCaptureDetails(baseline.core.id, first, null, storage), true);
  assert.equal(await saveCaptureDetails(baseline.core.id, second, first, storage), true);
  await flushCaptureDetailsWrites();
  assert.equal(await clearCaptureDetails(baseline.core.id, first, storage), false);
  assert.equal(await clearCaptureDetails(baseline.core.id, second, storage), true);
});

test('BEHAVIOR: startup recovery leaves pointer and evidence when BASIC is missing', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, { floorUse: 'commercial', bathroomCount: '2' });
  await prepareCapturedDetails(baseline, candidate, storage);
  const result = await recoverPreparedCapturedDetails({
    getProperties: async () => [],
    compareAndUpdate: async () => false,
  }, storage);
  assert.equal(result.status, 'missing_basic');
  assert.ok(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY));
  assert.ok(await loadPreparedCapturedDetails(baseline.core.id, storage));
});

test('BEHAVIOR: startup recovery CASes baseline and clears exact evidence/pointer', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, { floorUse: 'commercial', bathroomCount: '2' });
  await prepareCapturedDetails(baseline, candidate, storage);
  let current: Property = baseline;
  const result = await recoverPreparedCapturedDetails({
    getProperties: async () => [current],
    compareAndUpdate: async (from, to) => {
      assert.deepEqual(from, current);
      current = to;
      return true;
    },
  }, storage);
  assert.equal(result.status, 'complete');
  assert.deepEqual(current, candidate);
  assert.equal(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY), null);
  assert.equal(await loadPreparedCapturedDetails(baseline.core.id, storage), null);
});

test('BEHAVIOR: startup recovery cleans evidence after a crash post-CAS', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, { floorUse: 'commercial', bathroomCount: '2' });
  await prepareCapturedDetails(baseline, candidate, storage);
  const result = await recoverPreparedCapturedDetails({
    getProperties: async () => [candidate],
    compareAndUpdate: async () => {
      throw new Error('CAS must not run for an already enriched property');
    },
  }, storage);
  assert.equal(result.status, 'complete');
  assert.equal(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY), null);
  assert.equal(await loadPreparedCapturedDetails(baseline.core.id, storage), null);
});

test('BEHAVIOR: startup recovery preserves evidence and pointer on a third-state conflict', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, { floorUse: 'commercial', bathroomCount: '2' });
  await prepareCapturedDetails(baseline, candidate, storage);
  const changed = { ...baseline, activeOffer: { ...baseline.activeOffer, rentalPrice: { amount: 900, currencyCode: 'KWD' } } };
  const result = await recoverPreparedCapturedDetails({
    getProperties: async () => [changed],
    compareAndUpdate: async () => true,
  }, storage);
  assert.equal(result.status, 'conflict');
  assert.ok(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY));
  assert.ok(await loadPreparedCapturedDetails(baseline.core.id, storage));
});

test('BEHAVIOR: startup recovery resumes after evidence deletion but before pointer deletion', async () => {
  class PointerRemovalFailsOnceStorage extends MemoryStorage {
    failPointerRemoval = true;

    override async removeItem(key: string) {
      if (key === CAPTURE_DETAILS_POINTER_KEY && this.failPointerRemoval) {
        this.failPointerRemoval = false;
        throw new Error('simulated termination before pointer deletion');
      }
      await super.removeItem(key);
    }
  }

  const storage = new PointerRemovalFailsOnceStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'commercial',
    bathroomCount: '2',
  });
  await prepareCapturedDetails(baseline, candidate, storage);
  let current: Property = baseline;

  await assert.rejects(
    recoverPreparedCapturedDetails({
      getProperties: async () => [current],
      compareAndUpdate: async (_from, to) => {
        current = to;
        return true;
      },
    }, storage),
    /simulated termination/,
  );
  assert.deepEqual(current, candidate);
  assert.equal(await loadPreparedCapturedDetails(baseline.core.id, storage), null);
  assert.ok(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY));

  const resumed = await recoverPreparedCapturedDetails({
    getProperties: async () => [current],
    compareAndUpdate: async () => {
      throw new Error('CAS must not repeat after restart');
    },
  }, storage);
  assert.equal(resumed.status, 'complete');
  assert.equal(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY), null);
});