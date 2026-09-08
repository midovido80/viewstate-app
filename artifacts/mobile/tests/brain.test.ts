import test from 'node:test';
import assert from 'node:assert/strict';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import { createPerson } from '../services/people.ts';
import {
  buildBrainPresentation,
  ViewStateBrain,
  normalizeSearch,
  searchProperties,
  searchPeopleAndRequirements,
  validateBrainIntent,
} from '../services/brain.ts';
import {
  createPushToTalkLifecycle,
  startPermittedRecording,
  VoiceRequestError,
} from '../services/brainVoice.ts';

const requirement: SeekerRequirement = {
  id: '55555555-5555-4555-8555-555555555555',
  seekerId: 'person-1',
  purpose: 'rent',
  propertyType: 'apartment',
  preferredAreaIds: ['abdullah_al_salem'],
  budget: { minimum: 500, maximum: 800, currencyCode: 'KWD' },
  notes: 'Family apartment',
};
const person = createPerson({
  id: 'person-1', name: 'Ahmed', displayPhone: '+96550000001',
  classifications: ['seeker'], notes: '',
});
const property: Property = {
  core: { id: 'property-1', propertyType: 'apartment', locationArea: { id: 'abdullah_al_salem' } },
  activeOffer: {
    id: 'offer-1', propertyCoreId: 'property-1', transaction: 'rent',
    rentalPrice: { amount: 650, currencyCode: 'KWD' }, rentalPeriodId: 'monthly',
  },
  typeDetails: { propertyType: 'apartment', bedroomCount: 2, bathroomCount: 2 },
};
const reader = {
  getPeople: async () => [person],
  getRequirements: async () => [requirement],
  getProperties: async () => [property],
};

test('validates only the three server intent goals', () => {
  assert.deepEqual(validateBrainIntent({ goal: 'Property Search', query: 'Abdullah' }),
    { ok: true, value: { goal: 'property_search', criteria: 'Abdullah' } });
  assert.equal(validateBrainIntent({ goal: 'property_search', criteria: 'x', propertyId: 'invented' }).ok, false);
  assert.equal(validateBrainIntent({ goal: 'delete_everything' }).ok, false);
});

test('validates the API structured intent extraction without accepting IDs', () => {
  const parsed = validateBrainIntent({
    intent: 'property_search',
    originalQuery: 'شقة في عبد الله السالم',
    propertyType: 'apartment',
    purpose: 'rent',
    areaTerms: ['عبد الله السالم'],
    budgetMin: null,
    budgetMax: 800,
    personTerms: null,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.goal, 'property_search');
    assert.equal(parsed.value.criteria, 'شقة في عبد الله السالم');
  }
  assert.equal(validateBrainIntent({
    intent: 'property_search', originalQuery: 'x', propertyId: 'not-local',
  }).ok, false);
});

test('search dispatch returns existing property references for exact safe criteria', async () => {
  const brain = new ViewStateBrain(reader);
  for (const criteria of ['abdullah', 'عبد الله']) {
    const result = await brain.dispatch({ goal: 'property_search', criteria });
    assert.equal(result.goal, 'property_search');
    if (result.goal === 'property_search') {
      assert.equal(result.properties[0], property);
      assert.deepEqual(result.properties.map(item => item.core.id), ['property-1']);
    }
  }
});

test('property extraction filters only local records by type, purpose, area, and budget', async () => {
  const result = await new ViewStateBrain(reader).dispatch({
    goal: 'property_search',
    criteria: 'شقة للإيجار في عبد الله السالم حتى 800',
    serverCriteria: {
      originalQuery: 'شقة للإيجار في عبد الله السالم حتى 800',
      propertyType: 'apartment',
      purpose: 'rent',
      areaTerms: ['عبد الله السالم'],
      budgetMax: 800,
    },
  });
  assert.equal(result.goal, 'property_search');
  if (result.goal === 'property_search') {
    assert.deepEqual(result.properties, [property]);
    assert.ok(result.properties.every(item => item.core.id !== 'server-invented-property'));
  }
});

test('Arabic search normalization folds only approved orthographic variants', () => {
  assert.equal(normalizeSearch('إيجــار،  کافيه ي'), normalizeSearch('ايجار كافيه ى'));
  assert.notEqual(normalizeSearch('مدرسة'), normalizeSearch('مدرسه'));
  assert.notEqual(normalizeSearch('بيت'), normalizeSearch('بيه'));
});

test('commercial property searches keep Shop type separate from commercial activity', () => {
  const shop: Property = {
    ...property,
    core: { ...property.core, id: 'shop-1', propertyType: 'shop' },
    typeDetails: {
      propertyType: 'shop',
      commercialActivity: {
        value: 'Coffee & Gifts',
        privacy: { classification: 'normal', disclosurePolicy: 'normal' },
      },
    },
  };
  assert.deepEqual(
    searchProperties([shop], 'shop', {
      originalQuery: 'shop',
      propertyType: 'shop',
    }),
    [shop],
  );
  assert.deepEqual(
    searchProperties([shop], 'coffee gifts', {
      originalQuery: 'coffee gifts',
      commercialActivity: 'Coffee & Gifts',
    }),
    [shop],
  );
  assert.deepEqual(
    searchProperties([shop], 'shop', {
      originalQuery: 'shop',
      commercialActivity: 'Shop',
    }),
    [],
  );
});

test('commercial activity scopes saved requirements and Match All runs, not candidate properties', async () => {
  const commercialRequirement: SeekerRequirement = {
    ...requirement,
    propertyType: 'shop',
    commercialActivity: 'Coffee & Gifts',
  };
  const commercialPersonResults = searchPeopleAndRequirements(
    [person],
    [commercialRequirement],
    'coffee gifts',
    { originalQuery: 'coffee gifts', commercialActivity: 'Coffee & Gifts' },
  );
  assert.equal(commercialPersonResults[0]?.requirements[0], commercialRequirement);
  assert.deepEqual(searchPeopleAndRequirements(
    [person],
    [commercialRequirement],
    'retail',
    { originalQuery: 'retail', commercialActivity: 'Retail' },
  ), []);
  const result = await new ViewStateBrain({
    ...reader,
    getRequirements: async () => [commercialRequirement],
  }).dispatch({
    goal: 'find_matches',
    serverCriteria: { originalQuery: 'coffee gifts', commercialActivity: 'Coffee & Gifts' },
  });
  assert.equal(result.goal, 'find_matches');
  if (result.goal === 'find_matches') {
    assert.deepEqual(result.snapshot.requirements, [commercialRequirement]);
    assert.deepEqual(result.snapshot.properties, [property]);
  }
});

test('joined people and requirement search returns local references without fabricated IDs', async () => {
  const result = searchPeopleAndRequirements([person], [requirement], 'عبد الله');
  assert.equal(result[0]?.person, person);
  assert.equal(result[0]?.requirements[0], requirement);
  const dispatched = await new ViewStateBrain(reader).dispatch({
    goal: 'people_requirements_search', criteria: 'Ahmed',
  });
  assert.equal(dispatched.goal, 'people_requirements_search');
  if (dispatched.goal === 'people_requirements_search') {
    assert.equal(dispatched.people[0]?.person, person);
    assert.equal(dispatched.people[0]?.requirements[0], requirement);
  }
});

test('builds structured Property, Person, Requirement, and Match presentation from local records', async () => {
  const brain = new ViewStateBrain(reader);
  const propertyResult = buildBrainPresentation(
    await brain.dispatch({ goal: 'property_search', criteria: 'abdullah' }),
  );
  assert.equal(propertyResult.goal, 'property_search');
  if (propertyResult.goal === 'property_search') {
    assert.deepEqual(propertyResult.properties[0], {
      id: property.core.id,
      propertyType: 'apartment',
      areaId: 'abdullah_al_salem',
      transaction: 'rent',
      priceAmount: 650,
      currencyCode: 'KWD',
      activity: undefined,
    });
  }

  const peopleResult = buildBrainPresentation(
    await brain.dispatch({ goal: 'people_requirements_search', criteria: 'Ahmed' }),
  );
  assert.equal(peopleResult.goal, 'people_requirements_search');
  if (peopleResult.goal === 'people_requirements_search') {
    assert.equal(peopleResult.people[0]?.person.name, 'Ahmed');
    assert.equal(peopleResult.people[0]?.requirements[0]?.id, requirement.id);
    assert.equal(peopleResult.people[0]?.requirements[0]?.personName, 'Ahmed');
  }

  const matchResult = buildBrainPresentation(
    await brain.dispatch({ goal: 'find_matches' }),
  );
  assert.equal(matchResult.goal, 'find_matches');
  if (matchResult.goal === 'find_matches') {
    assert.equal(matchResult.runs[0]?.requirement?.id, requirement.id);
    assert.equal(matchResult.runs[0]?.person?.id, person.id);
    assert.equal(matchResult.runs[0]?.matches[0]?.property?.id, property.core.id);
    assert.equal(matchResult.runs[0]?.matches[0]?.score, 100);
  }
});

test('Brain match presentation keeps score and labels on the same captured snapshot', async () => {
  const snapshotProperty: Property = {
    ...property,
    core: { ...property.core, locationArea: { id: 'bayan' } },
  };
  const result = await new ViewStateBrain({
    ...reader,
    getRequirements: async () => [{
      ...requirement,
      preferredAreaIds: ['bayan'],
    }],
    getProperties: async () => [snapshotProperty],
  }).dispatch({ goal: 'find_matches' });
  const presentation = buildBrainPresentation(result);
  const laterRevision = {
    ...snapshotProperty,
    core: { ...snapshotProperty.core, locationArea: { id: 'daiya' } },
  };
  assert.equal(laterRevision.core.locationArea.id, 'daiya');
  assert.equal(presentation.goal, 'find_matches');
  if (presentation.goal === 'find_matches') {
    assert.equal(presentation.runs[0]?.matches[0]?.property?.areaId, 'bayan');
    assert.equal(presentation.runs[0]?.matches[0]?.score, 100);
  }
});

test('Find Matches delegates through the snapshot matching path', async () => {
  const result = await new ViewStateBrain(reader).dispatch({ goal: 'find_matches' });
  assert.equal(result.goal, 'find_matches');
  if (result.goal === 'find_matches') {
    assert.equal(result.snapshot.properties[0], property);
    assert.equal(result.runs[0]?.matches[0]?.propertyId, property.core.id);
    assert.equal(result.runs[0]?.matches[0]?.qualifies, true);
  }
});

test('Find Matches scopes records from extracted criteria without synthesizing a result', async () => {
  const result = await new ViewStateBrain(reader).dispatch({
    goal: 'find_matches',
    serverCriteria: {
      originalQuery: 'apartments for Ahmed',
      propertyType: 'apartment',
      personTerms: ['Ahmed'],
    },
  });
  assert.equal(result.goal, 'find_matches');
  if (result.goal === 'find_matches') {
    assert.deepEqual(result.runs.map(run => run.requirementId), [requirement.id]);
    assert.deepEqual(result.runs.flatMap(run => run.matches).map(match => match.propertyId), [property.core.id]);
    assert.ok(result.runs.flatMap(run => run.matches).every(match => match.propertyId !== 'server-invented-property'));
  }
});

test('Find Matches keeps a qualifying cross-area Property in the complete engine candidate pool', async () => {
  const crossAreaRequirement: SeekerRequirement = {
    ...requirement,
    bedroomsMinimum: 2,
    bathroomsMinimum: 2,
  };
  const crossAreaProperty: Property = {
    ...property,
    core: {
      ...property.core,
      id: 'cross-area-property',
      locationArea: { id: 'adailiya' },
    },
    activeOffer: {
      ...property.activeOffer,
      id: 'cross-area-offer',
      propertyCoreId: 'cross-area-property',
    },
  };
  const result = await new ViewStateBrain({
    ...reader,
    getRequirements: async () => [crossAreaRequirement],
    getProperties: async () => [crossAreaProperty],
  }).dispatch({
    goal: 'find_matches',
    serverCriteria: {
      originalQuery: 'Find apartments for Ahmed in Abdullah Al Salem',
      propertyType: 'apartment',
      areaTerms: ['abdullah_al_salem'],
      personTerms: ['Ahmed'],
    },
  });
  assert.equal(result.goal, 'find_matches');
  if (result.goal === 'find_matches') {
    const match = result.runs[0]?.matches[0];
    const location = match?.explanations.find(item => item.criterion === 'ordered_location');
    assert.deepEqual(result.snapshot.properties, [crossAreaProperty]);
    assert.equal(match?.propertyId, 'cross-area-property');
    assert.equal(match?.locationRank, null);
    assert.equal(location?.awardedPoints, 6);
    assert.ok((match?.score ?? 0) >= 70);
    assert.equal(match?.qualifies, true);
  }
});

test('push-to-talk records once, stops, and returns editable final text', async () => {
  const calls: string[] = [];
  const recorder = {
    uri: 'file:///brain.m4a',
    async prepareToRecordAsync() { calls.push('prepare'); },
    record(options?: { forDuration?: number }) { calls.push(`record:${options?.forDuration}`); },
    async stop() { calls.push('stop'); },
  };
  const voice = createPushToTalkLifecycle(recorder, async uri => {
    calls.push(`transcribe:${uri}`);
    return '  ابحث عن عقار  ';
  });
  await voice.start();
  assert.equal(await voice.stop(), 'ابحث عن عقار');
  assert.deepEqual(calls, [
    'prepare',
    'record:30',
    'stop',
    'transcribe:file:///brain.m4a',
  ]);
  await voice.cancel();
  assert.equal(calls.at(-1), 'transcribe:file:///brain.m4a');
});

test('Android recording requests permission, enables recording mode, then starts', async () => {
  const calls: string[] = [];
  const started = await startPermittedRecording(
    async () => {
      calls.push('permission');
      return { granted: true };
    },
    async mode => {
      calls.push(`mode:${mode.allowsRecording}:${mode.playsInSilentMode}`);
    },
    {
      async start() {
        calls.push('start');
      },
    },
  );
  assert.equal(started, true);
  assert.deepEqual(calls, ['permission', 'mode:true:true', 'start']);

  calls.length = 0;
  assert.equal(await startPermittedRecording(
    async () => ({ granted: false }),
    async () => { calls.push('mode'); },
    { async start() { calls.push('start'); } },
  ), false);
  assert.deepEqual(calls, []);

  const failureCalls: string[] = [];
  await assert.rejects(startPermittedRecording(
    async () => ({ granted: true }),
    async mode => { failureCalls.push(`mode:${mode.allowsRecording}`); },
    { async start() { throw new Error('native recorder failed'); } },
  ), /native recorder failed/);
  assert.deepEqual(failureCalls, ['mode:true', 'mode:false']);
});

test('push-to-talk fails closed when recording or transcription has no text', async () => {
  const noFile = createPushToTalkLifecycle({
    uri: null,
    async prepareToRecordAsync() {},
    record() {},
    async stop() {},
  }, async () => 'not-called');
  await assert.rejects(noFile.stop(), /RECORDING_NO_FILE/);

  const empty = createPushToTalkLifecycle({
    uri: 'file:///empty.m4a',
    async prepareToRecordAsync() {},
    record() {},
    async stop() {},
  }, async () => '   ');
  await assert.rejects(empty.stop(), /TRANSCRIPTION_EMPTY/);
});

test('push-to-talk shares an in-flight stop instead of transcribing twice', async () => {
  let transcriptions = 0;
  const voice = createPushToTalkLifecycle({
    uri: 'file:///once.m4a',
    async prepareToRecordAsync() {},
    record() {},
    async stop() {},
  }, async () => {
    transcriptions += 1;
    return 'request';
  });
  await voice.start();
  assert.deepEqual(await Promise.all([voice.stop(), voice.stop()]), ['request', 'request']);
  assert.equal(transcriptions, 1);
});

test('push-to-talk resets audio before transcription and cancel aborts pending work', async () => {
  const events: string[] = [];
  let aborted = false;
  const voice = createPushToTalkLifecycle({
    uri: 'file:///abort.m4a',
    async prepareToRecordAsync() {},
    record() {},
    async stop() { events.push('stop'); },
  }, async (_uri, signal) => {
    events.push('transcribe');
    signal?.addEventListener('abort', () => { aborted = true; });
    return new Promise<string>(() => undefined);
  }, async () => { events.push('audio-reset'); });
  await voice.start();
  void voice.stop();
  await new Promise(resolve => setImmediate(resolve));
  await voice.cancel();
  assert.deepEqual(events.slice(0, 3), ['stop', 'audio-reset', 'transcribe']);
  assert.equal(aborted, true);
});

test('push-to-talk cancellation while native stop is pending prevents transcription', async () => {
  let releaseStop!: () => void;
  const stopGate = new Promise<void>(resolve => {
    releaseStop = resolve;
  });
  let transcriptions = 0;
  const voice = createPushToTalkLifecycle({
    uri: 'file:///cancel-before-upload.m4a',
    async prepareToRecordAsync() {},
    record() {},
    async stop() {
      await stopGate;
    },
  }, async () => {
    transcriptions += 1;
    return 'must not run';
  });

  await voice.start();
  const stopping = voice.stop();
  await voice.cancel();
  releaseStop();

  await assert.rejects(stopping, (error: unknown) =>
    error instanceof VoiceRequestError && error.code === 'TRANSCRIPTION_ABORTED');
  assert.equal(transcriptions, 0);
});

test('Brain UI and API keep voice half-duplex and data local', async () => {
  const { readFile } = await import('node:fs/promises');
  const [screen, voice, route, appConfig] = await Promise.all([
    readFile('app/(tabs)/brain.tsx', 'utf8'),
    readFile('services/brainVoice.ts', 'utf8'),
    readFile('../api-server/src/routes/brain.ts', 'utf8'),
    readFile('app.json', 'utf8'),
  ]);
  assert.match(screen, /setText\(transcript\);\s*setVoiceStatus\('idle'\)/);
  assert.match(voice, /payload\.transcript/);
  assert.match(screen, /void execute\(suggestion\)/);
  assert.match(screen, /setAudioModeAsync/);
  assert.match(appConfig, /"recordAudioAndroid": true/);
  assert.match(route, /MAX_AUDIO_BYTES = 8 \* 1024 \* 1024/);
  assert.match(route, /limited\(20\)/);
  assert.match(route, /limited\(6\)/);
  assert.match(route, /gpt-4o-mini-transcribe/);
  assert.match(route, /You receive only the user's query, never application data/);
  assert.match(route, /commercialActivity/);
  assert.match(voice, /30_000/);
  assert.match(screen, /AppState\.addEventListener/);
  assert.match(screen, /if \(state !== 'active'\) \{[\s\S]*lifecycle\.current\?\.cancel\(\)/);
  assert.match(screen, /Linking\.openSettings/);
});

test('Brain result cards are visibly interactive, localized, safely routed, and never render IDs', async () => {
  const { readFile } = await import('node:fs/promises');
  const [screen, cards, i18n] = await Promise.all([
    readFile('app/(tabs)/brain.tsx', 'utf8'),
    readFile('components/BrainResults.tsx', 'utf8'),
    readFile('contexts/I18nContext.tsx', 'utf8'),
  ]);
  assert.match(screen, /useState<BrainPresentation \| null>/);
  assert.match(screen, /<BrainResults result=\{result\}/);
  assert.match(cards, /Pressable/);
  assert.match(cards, /backgroundColor: pressed \? colors\.accent : colors\.card/);
  assert.match(cards, /accessibilityRole="button"/);
  assert.match(cards, /encodeURIComponent/);
  assert.match(cards, /\/matching\?requirementId=/);
  assert.match(cards, /disabled=\{!item\.run\.requirement\}/);
  assert.doesNotMatch(cards, /<Text[^>]*>\s*\{[^}]*\.(?:id|propertyId|requirementId)\}/);
  assert.match(i18n, /'brain\.results\.properties': 'Properties'/);
  assert.match(i18n, /'brain\.results\.matches': 'نتائج المطابقة'/);
  assert.match(i18n, /'brain\.results\.unavailable': 'Data unavailable'/);
});