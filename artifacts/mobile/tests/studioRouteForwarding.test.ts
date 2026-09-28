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
  assert.match(screen, /if \(classification === 'seeker'\) \{\s*router\.push\(getPersonWantedRequirementRoute\(person\.id\)/);
  assert.match(screen, /person\.classifications\.map\(classification =>/);
  assert.match(screen, /testID=\{`person-classification-action-\$\{classification\}`\}/);
  assert.doesNotMatch(screen, /person-add-wanted-studio|person-add-requirement/);
});

test('legacy and normal Property edit URLs forward Studio by same ID; other properties remain generic', async () => {
  const propertyId = 'property / typed β?ref=exact';
  const encoded = encodeURIComponent(propertyId);
  assert.equal(getPropertyEditFormHref(propertyId, 'apartment', 'studio'), `/capture/studio?editPropertyId=${encoded}`);
  assert.equal(getPropertyEditFormHref(propertyId, 'villa'), `/property/${encoded}/edit`);

  const screen = await source('../app/property/[propertyCoreId].tsx');
  assert.match(screen, /return getPropertyEditFormHref\(/);
  assert.match(screen, /router\.replace\(getPropertyEditRouteHref\(property\.core\.id, true\)/);
  assert.match(screen, /const editRequested = .*forceEdit/);
  assert.match(screen, /router\.push\(getPropertyEditRouteHref\(property\.core\.id, offeredStudio\)/);
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
  assert.match(screen, /getRequirementEditFormTarget\(/);
  assert.match(screen, /if \(!editRequested \|\| !recordLoaded \|\| !baseline \|\| !isWantedStudio\(baseline\)\) return/);
  assert.match(screen, /router\.replace\(target\.href as never\)/);
  assert.match(screen, /testID="studio-requirement-unavailable"/);
  assert.doesNotMatch(screen, /getStudioRequirementFallbackEditHref/);
});

test('legacy new Studio Requirement deep links replace into the dedicated form only once', async () => {
  const screen = await source('../app/requirement/[requirementId].tsx');
  assert.match(screen, /routePropertyType !== 'apartment' \|\| routeApartmentSubtype !== 'studio'/);
  assert.match(screen, /newStudioForwardedKey\.current === key/);
  assert.match(screen, /const target = getPropertyFormRoute\(\{/);
  assert.match(screen, /router\.replace\(\{ pathname: target\.pathname, params: target\.params \} as never\)/);
  assert.match(screen, /newStudioForwardedKey\.current = key/);
});

test('legacy generic capture blocks Studio saves when values cannot be forwarded safely', async () => {
  const shouldBlock = await productionFunction('../app/capture/index.tsx', 'isGenericStudioCaptureBlocked');
  assert.equal(shouldBlock('studio' as never, undefined as never, undefined as never, undefined as never), true,
    'an in-flow Studio subtype query cannot be saved by the generic form');
  assert.equal(shouldBlock(undefined as never, 'apartment' as never, 'studio' as never, undefined as never), true,
    'a saved Studio subtype in the capture draft is protected');
  assert.equal(shouldBlock(undefined as never, 'villa' as never, undefined as never, 'studio' as never), true,
    'legacy Studio category metadata is also protected');
  assert.equal(shouldBlock(undefined as never, 'apartment' as never, 'standard_apartment' as never, undefined as never), false);
  assert.equal(shouldBlock(undefined as never, 'villa' as never, 'studio' as never, undefined as never), false,
    'stale subtype metadata on a different property type does not block that form');

  const screen = await source('../app/capture/index.tsx');
  assert.match(screen, /isGenericStudioCaptureBlocked\(\s*routeApartmentSubtype,\s*draft\.propertyType,\s*captureDetails\.apartmentSubtype/);
  assert.match(screen, /canonicalApartmentSubtypeForCategory\(demoMetadata\.categoryId\)/);
  assert.match(screen, /testID="capture-studio-route-blocked"/);
  assert.match(screen, /disabled=\{isStudioCaptureBlocked \|\|/);
  assert.match(screen, /onPress=\{openPreview\} disabled=\{isStudioCaptureBlocked\}/);
  assert.match(screen, /onPress=\{save\} loading=\{submitting\} disabled=\{isStudioCaptureBlocked\}/);
  const openPreview = screen.slice(screen.indexOf('const openPreview = () =>'), screen.indexOf('const save = async () =>'));
  const save = screen.slice(screen.indexOf('const save = async () =>'), screen.indexOf('const saveDraft = async () =>'));
  assert.match(openPreview, /if \(isStudioCaptureBlocked\) return/);
  assert.match(save, /if \(isStudioCaptureBlocked\) return/);
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
  assert.match(handler, /routeTransaction === undefined[\s\S]*routeTransaction === 'sale' \|\| routeTransaction === 'rent'/);
  assert.match(handler, /getLegacyStudioCaptureEscapeTarget\(transaction, linkPersonId, sourceRole\)/);
  assert.match(handler, /router\.push\(\{ pathname: target\.pathname, params: target\.params \} as never\)/);
  assert.doesNotMatch(handler, /router\.replace|updateDraft\(|updateCaptureDetails\(|replaceCaptureDetails\(|clearCaptureDetails\(|resetDraft\(/);
  assert.match(screen, /title=\{language === 'ar' \? 'فتح نموذج الاستوديو' : 'Open Studio form'\}/);
  assert.match(screen, /onPress=\{openDedicatedStudio\}/);
  assert.match(screen, /testID="capture-open-dedicated-studio"/);
  assert.match(screen, /Details from the generic Property draft will not be copied; the generic draft remains available if you go back/);
});

test('deep-linked Studio edits fall back to their exact detail route without changing create behavior', async () => {
  const targetFor = await productionFunction('../app/capture/studio.tsx', 'getStudioEditBackTarget');
  const requirementId = 'requirement / exact β';
  const seekerId = 'seeker / exact β';
  const propertyId = 'property / exact β';

  assert.deepEqual(
    targetFor('wanted' as never, true as never, undefined as never, requirementId as never, seekerId as never),
    {
      pathname: '/requirement/[requirementId]',
      params: { requirementId, seekerId },
    },
  );
  assert.deepEqual(
    targetFor('offered' as never, true as never, propertyId as never, undefined as never, undefined as never),
    { pathname: '/property/[propertyCoreId]', params: { propertyCoreId: propertyId } },
  );
  assert.equal(targetFor('wanted' as never, false as never, undefined as never, undefined as never, seekerId as never), null);
  assert.equal(targetFor('offered' as never, false as never, propertyId as never, undefined as never, undefined as never), null);
  assert.equal(targetFor('wanted' as never, true as never, undefined as never, requirementId as never, undefined as never), null);

  const screen = await source('../app/capture/studio.tsx');
  assert.match(screen, /if \(router\.canGoBack\(\)\) \{\s*router\.back\(\);\s*return;\s*\}/);
  assert.match(screen, /if \(showingReview\) returnToForm\(\);\s*else leaveStudio\(\);/);
  assert.match(screen, /if \(step === 'review'\) \{\s*returnToForm\(\);\s*return true;\s*\}/);
});