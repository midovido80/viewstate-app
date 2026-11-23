import { sourceMatch, sourceDoesNotMatch, sourceIndex } from "./sourceAssertions";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { resolveSourcePath } from './sourcePath.ts';
import { getPropertyEditFormHref, getRequirementEditFormTarget } from '@/services/propertyFormRoutes';

const source = async (path: string) =>
  readFile(resolveSourcePath(path, import.meta.url), 'utf8');

async function productionFunction(path: string, name: string) {
  const text = await source(path);
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(declaration, `Expected production route function ${name}`);
  const compiled = ts.transpileModule(declaration.getText(file).replace(/^export\s+/, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(`${compiled}; return ${name};`)() as (...args: never[]) => unknown;
}

test('Person Details route opens the normal Wanted chooser for the exact seeker without defaults', async () => {
  const route = await productionFunction('../app/person/[personId].tsx', 'getPersonWantedRequirementRoute');
  const personId = 'seeker / typed β?ref=exact';
  assert.deepEqual(route(personId as never), {
    pathname: '/capture/transaction',
    params: { mode: 'wanted', seekerId: personId },
  });

  const screen = await source('../app/person/[personId].tsx');
  sourceMatch(screen, /if \(classification === 'seeker'\) \{\s*router\.push\(getPersonWantedRequirementRoute\(person\.id\)/);
  sourceMatch(screen, /person\.classifications\.map\(classification =>/);
  sourceMatch(screen, /testID=\{`person-classification-action-\$\{classification\}`\}/);
  sourceDoesNotMatch(screen, /person-add-wanted-studio|person-add-requirement/);
});

test('legacy and normal Property edit URLs forward Studio by same ID; other properties remain generic', async () => {
  const propertyId = 'property / typed β?ref=exact';
  const encoded = encodeURIComponent(propertyId);
  assert.equal(getPropertyEditFormHref(propertyId, 'apartment', 'studio'), `/capture/studio?editPropertyId=${encoded}`);
  assert.equal(getPropertyEditFormHref(propertyId, 'villa'), `/property/${encoded}/edit`);

  const screen = await source('../app/property/[propertyCoreId].tsx');
  sourceMatch(screen, /return getPropertyEditFormHref\(/);
  sourceMatch(screen, /router\.replace\(withMatchingReturn\(getPropertyEditRouteHref\(property\.core\.id, true\)/);
  sourceMatch(screen, /const editRequested = .*forceEdit/);
  sourceMatch(screen, /router\.push\(withMatchingReturn\(getPropertyEditRouteHref\(property\.core\.id, offeredStudio\)/);
});

test('Person-origin Offered Studio validates its exact source context before Property save', async () => {
  const screen = await source('../app/capture/studio.tsx');
  const saveFlow = screen.slice(
    screen.indexOf('const doSave = async () =>'),
    screen.indexOf('const retryPropertySave = async () =>'),
  );
  const sourceValidation = saveFlow.indexOf('saveStudioPropertyFromPersonSource(');
  const propertySave = saveFlow.indexOf('saveStudioProperty({');
  assert.ok(sourceValidation >= 0 && propertySave >= 0 && sourceValidation < propertySave);
  sourceMatch(saveFlow, /if \(linkPersonId && !editing\)/);
  sourceMatch(saveFlow, /requestedRole: sourceRole/);
  sourceMatch(screen, /sourceContext\.current = sourceSave\.sourceContext/);
  sourceMatch(screen, /ensureStudioPropertySourceLink\(property\.core\.id, context\.personId, context\.role, store\)/);
  sourceMatch(screen, /const context = sourceContext\.current\?\.personId === linkPersonId[\s\S]*resolveStudioPersonSourceContext\(linkPersonId, sourceRole, store\)/);
});

test('generic Requirement edit forwards only hydratable Studio IDs and fails closed otherwise', async () => {
  const requirementId = 'requirement / typed β?ref=exact';
  const encoded = encodeURIComponent(requirementId);
  assert.deepEqual(getRequirementEditFormTarget(requirementId, 'seeker-1', true, true), {
    kind: 'studio',
    href: `/capture/studio?editRequirementId=${encoded}`,
  });
  assert.deepEqual(getRequirementEditFormTarget(requirementId, 'seeker-1', true, false), { kind: 'blocked' });
  assert.deepEqual(getRequirementEditFormTarget(requirementId, 'seeker-1', false, true), {
    kind: 'generic',
    href: `/requirement/${encoded}?seekerId=seeker-1&edit=1`,
  });

  const screen = await source('../app/requirement/[requirementId].tsx');
  sourceMatch(screen, /getRequirementEditFormTarget\(/);
  sourceMatch(screen, /if \(!editRequested \|\| !recordLoaded \|\| !baseline \|\| !isWantedStudio\(baseline\)\) return/);
  sourceMatch(screen, /router\.replace\(target\.href as never\)/);
  sourceMatch(screen, /testID="studio-requirement-unavailable"/);
  sourceDoesNotMatch(screen, /getStudioRequirementFallbackEditHref/);
});

test('legacy new Studio Requirement deep links replace into the dedicated form only once', async () => {
  const screen = await source('../app/requirement/[requirementId].tsx');
  sourceMatch(screen, /routePropertyType !== 'apartment' \|\| routeApartmentSubtype !== 'studio'/);
  sourceMatch(screen, /newStudioForwardedKey\.current === key/);
  sourceMatch(screen, /const target = getPropertyFormRoute\(\{/);
  sourceMatch(screen, /router\.replace\(\{ pathname: target\.pathname, params: target\.params \} as never\)/);
  sourceMatch(screen, /newStudioForwardedKey\.current = key/);
});

test('legacy generic capture blocks Studio saves when values cannot be forwarded safely', async () => {
  const shouldBlock = await productionFunction('../app/capture/index.tsx', 'isGenericStudioCaptureBlocked');
  assert.equal(shouldBlock('studio' as never, undefined as never, undefined as never, undefined as never), true,
    'an in-flow Studio subtype query cannot be saved by the generic form');
  assert.equal(shouldBlock(undefined as never, 'apartment' as never, 'studio' as never, undefined as never), true,
    'a saved Studio subtype in the capture draft is protected');
  assert.equal(shouldBlock(undefined as never, 'villa' as never, undefined as never, 'studio' as never), false,
    'a stale Studio category cannot override an explicitly selected non-Apartment type');
  assert.equal(shouldBlock('standard' as never, 'apartment' as never, 'studio' as never, 'studio' as never), false,
    'an explicit Standard Apartment selection outranks stale Studio draft metadata');
  assert.equal(shouldBlock('studio' as never, 'floor' as never, 'studio' as never, 'studio' as never), false,
    'an explicit Floor route outranks stale Apartment subtype metadata');
  assert.equal(shouldBlock('unsupported' as never, 'apartment' as never, undefined as never, undefined as never), true,
    'unsupported explicit subtypes fail closed');
  assert.equal(shouldBlock(undefined as never, 'apartment' as never, 'standard_apartment' as never, undefined as never), false);
  assert.equal(shouldBlock(undefined as never, 'villa' as never, 'studio' as never, undefined as never), false,
    'stale subtype metadata on a different property type does not block that form');

  const screen = await source('../app/capture/index.tsx');
  sourceMatch(screen, /isGenericStudioCaptureBlocked\(\s*routeApartmentSubtype,\s*selectedPropertyType,\s*captureDetails\.apartmentSubtype/);
  sourceMatch(screen, /canonicalApartmentSubtypeForCategory\(demoMetadata\.categoryId\)/);
  sourceMatch(screen, /testID="capture-studio-route-blocked"/);
  sourceMatch(screen, /disabled=\{isStudioCaptureBlocked \|\|/);
  sourceMatch(screen, /onPress=\{openPreview\} disabled=\{isStudioCaptureBlocked\}/);
  sourceMatch(screen, /onPress=\{saveWithImport\} loading=\{submitting\} disabled=\{isStudioCaptureBlocked\}/);
  sourceMatch(screen, /withActiveImport\(storage, firstCaptureParam\(routeParams.importId\), \(\) => save\(\.\.\.args\)\)/);
  const openPreview = screen.slice(screen.indexOf('const openPreview = () =>'), screen.indexOf('const save = async () =>'));
  const save = screen.slice(screen.indexOf('const save = async () =>'), screen.indexOf('const saveDraft = async () =>'));
  sourceMatch(openPreview, /if \(isStudioCaptureBlocked\) return/);
  sourceMatch(save, /if \(isStudioCaptureBlocked\) return/);
});

test('legacy Studio escape CTA opens a fresh form or shared chooser and preserves its source draft', async () => {
  const targetFor = await productionFunction('../app/capture/index.tsx', 'getLegacyStudioCaptureEscapeTarget');
  const linkPersonId = 'person / exact β?role=owner';
  assert.deepEqual(targetFor('sale' as never, linkPersonId as never, 'owner' as never), {
    pathname: '/capture/studio',
    params: { mode: 'offered', transaction: 'sale', linkPersonId, sourceRole: 'owner' },
  });
  assert.deepEqual(targetFor('rent' as never, linkPersonId as never, 'building_guard' as never), {
    pathname: '/capture/studio',
    params: { mode: 'offered', transaction: 'rent', linkPersonId, sourceRole: 'building_guard' },
  });
  assert.deepEqual(targetFor('invalid' as never, linkPersonId as never, 'owner' as never), {
    pathname: '/capture/transaction',
    params: { mode: 'offered', linkPersonId, sourceRole: 'owner' },
  });
  assert.deepEqual(targetFor(undefined as never, undefined as never, undefined as never), {
    pathname: '/capture/transaction',
    params: { mode: 'offered' },
  });

  const screen = await source('../app/capture/index.tsx');
  const handler = screen.slice(
    screen.indexOf('const openDedicatedStudio = () =>'),
    screen.indexOf('const webBlobStore = useRef'),
  );
  sourceMatch(handler, /routeTransaction === undefined[\s\S]*routeTransaction === 'sale' \|\| routeTransaction === 'rent'/);
  sourceMatch(handler, /getLegacyStudioCaptureEscapeTarget\(transaction, linkPersonId, sourceRole\)/);
  sourceMatch(handler, /router\.push\(\{ pathname: target\.pathname, params: target\.params \} as never\)/);
  sourceDoesNotMatch(handler, /router\.replace|updateDraft\(|updateCaptureDetails\(|replaceCaptureDetails\(|clearCaptureDetails\(|resetDraft\(/);
  sourceMatch(screen, /title=\{language === 'ar' \? 'فتح نموذج الاستوديو' : 'Open Studio form'\}/);
  sourceMatch(screen, /onPress=\{openDedicatedStudio\}/);
  sourceMatch(screen, /testID="capture-open-dedicated-studio"/);
  sourceMatch(screen, /Details from the generic Property draft will not be copied; the generic draft remains available if you go back/);
});

test('deep-linked Studio edits fall back to their exact detail route without changing create behavior', async () => {
  const targetFor = await productionFunction('../app/capture/studio.tsx', 'getStudioEditBackTarget');
  const requirementId = 'requirement / exact β';
  const seekerId = 'seeker / exact β';
  const propertyId = 'property / exact β';

  assert.deepEqual(
    targetFor('wanted' as never, true as never, undefined as never, requirementId as never, seekerId as never),
    {
      pathname: '/requirement/view/[requirementId]',
      params: { requirementId, seekerId },
    },
  );
  assert.deepEqual(
    targetFor('offered' as never, true as never, propertyId as never, undefined as never, undefined as never),
    { pathname: '/property/[propertyCoreId]', params: { propertyCoreId: propertyId } },
  );
  assert.equal(targetFor('wanted' as never, false as never, undefined as never, undefined as never, seekerId as never), null);
  assert.equal(targetFor('offered' as never, false as never, propertyId as never, undefined as never, undefined as never), null);
  assert.deepEqual(
    targetFor('wanted' as never, true as never, undefined as never, requirementId as never, undefined as never),
    { pathname: '/requirement/view/[requirementId]', params: { requirementId } },
  );

  const screen = await source('../app/capture/studio.tsx');
  sourceMatch(screen, /fallback: studioBackTarget \?/);
  sourceMatch(screen, /useDraftBack\(\{ persist: persistStudio/);
  sourceMatch(screen, /step === 'review' && !savedProperty && !savedRequirement/);
});
