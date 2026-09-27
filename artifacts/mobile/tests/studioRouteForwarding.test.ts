import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { resolveSourcePath } from './sourcePath.ts';

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
  const route = await productionFunction('../app/property/[propertyCoreId].tsx', 'getPropertyEditRouteHref');
  const propertyId = 'property / typed β?ref=exact';
  const encoded = encodeURIComponent(propertyId);
  assert.equal(route(propertyId as never, true as never), `/capture/studio?editPropertyId=${encoded}`);
  assert.equal(route(propertyId as never, false as never), `/property/${encoded}/edit`);

  const screen = await source('../app/property/[propertyCoreId].tsx');
  assert.match(screen, /router\.replace\(getPropertyEditRouteHref\(property\.core\.id, true\)/);
  assert.match(screen, /const editRequested = .*forceEdit/);
  assert.match(screen, /router\.push\(getPropertyEditRouteHref\(property\.core\.id, offeredStudio\)/);
});

test('generic Requirement edit forwards only hydratable Studio IDs and fails closed otherwise', async () => {
  const route = await productionFunction('../app/requirement/[requirementId].tsx', 'getStudioRequirementRouteTarget');
  const requirementId = 'requirement / typed β?ref=exact';
  const encoded = encodeURIComponent(requirementId);
  assert.deepEqual(route(requirementId as never, true as never, true as never), {
    kind: 'studio',
    href: `/capture/studio?editRequirementId=${encoded}`,
  });
  assert.deepEqual(route(requirementId as never, true as never, false as never), { kind: 'blocked' });
  assert.deepEqual(route(requirementId as never, false as never, true as never), { kind: 'generic' });

  const screen = await source('../app/requirement/[requirementId].tsx');
  assert.match(screen, /if \(!editRequested \|\| !recordLoaded \|\| !baseline \|\| !isWantedStudio\(baseline\)\) return/);
  assert.match(screen, /router\.replace\(target\.href as never\)/);
  assert.match(screen, /testID="studio-requirement-unavailable"/);
  assert.doesNotMatch(screen, /getStudioRequirementFallbackEditHref/);
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