import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

function compileExpression(
  sourceFile: ts.SourceFile,
  expression: ts.Expression,
  parameters: readonly string[],
  values: readonly unknown[],
): (...args: unknown[]) => unknown {
  const compiled = ts.transpileModule(`return (${expression.getText(sourceFile)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...parameters, compiled)(...values) as (...args: unknown[]) => unknown;
}

test('Person primary actions follow assigned classifications and keep one Home action', async () => {
  const source = await readFile('app/person/[personId].tsx', 'utf8');

  assert.match(source, /const primaryActionTitle = \(classification: PersonClassification\)/);
  assert.match(source, /classification === 'seeker'.*Add Requirement/s);
  assert.match(source, /classification === 'owner'.*Add Offered Property/s);
  assert.match(source, /getPersonWantedRequirementRoute\(person\.id\)/);
  assert.match(source, /pathname: '\/capture\/transaction',\s*params: \{ mode: 'wanted', seekerId: personId \}/);
  assert.match(source, /person\.classifications\.length > 1/);
  assert.match(source, /person\.classifications\.map\(classification =>/);
  assert.match(source, /eligibleSourceRoles/);
  assert.equal((source.match(/testID="person-home"/g) ?? []).length, 1);
  assert.match(source, /flexDirection: isRTL \? 'row-reverse' : 'row'/);
  assert.match(source, /language === 'ar' \? 'اختر الإجراء' : 'Choose action'/);
});

test('Owner and property chooser Offered actions enter the transaction route with exact source context', async () => {
  const source = await readFile('app/person/[personId].tsx', 'utf8');
  const ownerActionBlock = source.slice(
    source.indexOf("const actionForClassification"),
    source.indexOf("const activatePrimaryAction"),
  );
  const propertyChooser = source.slice(
    source.indexOf('<Modal visible={propertyActionChooserOpen}'),
    source.indexOf('</Modal>', source.indexOf('<Modal visible={propertyActionChooserOpen}')),
  );

  assert.match(ownerActionBlock, /classification === 'owner'\) \{\s*router\.push\(\{\s*pathname: '\/capture\/transaction',\s*params: \{ mode: 'offered', linkPersonId: person\.id, sourceRole: 'owner' \}/);
  assert.match(propertyChooser, /if \(role && person\.classifications\.includes\(role\)\) router\.push\(\{\s*pathname: '\/capture\/transaction',\s*params: \{ mode: 'offered', linkPersonId: person\.id, sourceRole: role \}/);

  const ast = ts.createSourceFile('person-actions.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let ownerActionExpression: ts.Expression | undefined;
  let addPropertyHandler: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'actionForClassification') {
      ownerActionExpression = node.initializer;
    }
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.tagName.getText(ast) === 'Button'
    ) {
      const attributes = node.attributes.properties;
      const testId = attributes.find(attribute =>
        ts.isJsxAttribute(attribute)
        && attribute.name.getText(ast) === 'testID'
        && attribute.initializer
        && ts.isStringLiteral(attribute.initializer)
        && attribute.initializer.text === 'person-add-property');
      if (testId) {
        const onPress = attributes.find(attribute =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'onPress');
        if (onPress && ts.isJsxAttribute(onPress) && onPress.initializer && ts.isJsxExpression(onPress.initializer)) {
          addPropertyHandler = onPress.initializer.expression;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(ownerActionExpression && addPropertyHandler, 'both production Offered action handlers must be found');

  const exactPersonId = 'person / exact β?source=owner';
  const person = { id: exactPersonId, classifications: ['owner', 'building_guard'] };
  const ownerRoutes: unknown[] = [];
  const routeToTransaction = (target: unknown) => ownerRoutes.push(target);
  const ownerHandler = compileExpression(ast, ownerActionExpression!, [
    'router', 'person', 'sourceRoles', 'setSelectedSourceRole', 'setPropertyActionChooserOpen',
  ], [
    { push: routeToTransaction }, person, ['owner', 'building_guard'], () => undefined, () => undefined,
  ]);
  ownerHandler('owner');
  assert.deepEqual(ownerRoutes, [{
    pathname: '/capture/transaction',
    params: { mode: 'offered', linkPersonId: exactPersonId, sourceRole: 'owner' },
  }]);

  const chooserRoutes: unknown[] = [];
  let chooserClosed = false;
  const chooserHandler = compileExpression(ast, addPropertyHandler!, [
    'router', 'person', 'selectedSourceRole', 'setPropertyActionChooserOpen',
  ], [
    { push: (target: unknown) => chooserRoutes.push(target) },
    person,
    'building_guard',
    (open: boolean) => { chooserClosed = !open; },
  ]);
  chooserHandler();
  assert.equal(chooserClosed, true);
  assert.deepEqual(chooserRoutes, [{
    pathname: '/capture/transaction',
    params: { mode: 'offered', linkPersonId: exactPersonId, sourceRole: 'building_guard' },
  }]);
});

test('Link Property modal orders valid role selection before search and requires final confirmation', async () => {
  const source = await readFile('app/person/[personId].tsx', 'utf8');
  const modal = source.slice(source.indexOf('<Modal visible={linkOpen}'), source.indexOf('</Modal>', source.indexOf('<Modal visible={linkOpen}')));
  const role = modal.indexOf('link-source-role-${role}');
  const search = modal.indexOf('testID="link-property-search"');
  const choices = modal.indexOf('link-property-choice-${property.core.id}');
  const explicitConfirmation = modal.indexOf('testID="link-property-confirm"');

  assert.ok(role >= 0 && role < search && search < choices && choices < explicitConfirmation);
  assert.match(modal, /eligibleSourceRoles\.map\(role/);
  assert.match(modal, /selectedSourceRole === role/);
  assert.match(modal, /selectedProperty \? \(/);
  assert.match(modal, /Confirm linking this property\?/);
  assert.doesNotMatch(modal.slice(choices), /link-source-role-\$\{role\}/);

  const link = source.slice(source.indexOf('const link = async () =>'), source.indexOf('const unlink = async'));
  assert.match(link, /person\.classifications\.includes\(selectedSourceRole\)/);
  assert.match(link, /getLinksForPerson\(person\.id\)/);
  assert.match(link, /if \(!currentLinks\.some/);
  assert.match(link, /setPropertySource\(\{/);
  assert.match(link, /role: selectedSourceRole/);
});

test('post-save success uses brief localized feedback instead of a large action panel', async () => {
  const source = await readFile('app/person/[personId].tsx', 'utf8');
  assert.match(source, /params\.saved !== '1'/);
  assert.match(source, /setTimeout\(\(\) => \{\s*setConfirmation\(''\);/);
  assert.match(source, /testID="person-action-confirmation"/);
  assert.match(source, /language === 'ar' \? 'تم حفظ الشخص' : 'Person saved'/);
  assert.match(source, /if \(!confirmation\) return;[\s\S]*setTimeout\(\(\) => setConfirmation\(''\), 1800\)/);
  assert.match(source, /accessibilityRole="text"/);
  assert.match(source, /accessibilityLiveRegion="polite"/);
  assert.match(source, /setMode\('detail'\);\s*setConfirmation\(language === 'ar' \? 'تم حفظ الشخص' : 'Person saved'\)/);
  assert.match(source, /params\.requirementSaved !== '1'[\s\S]*setConfirmation\(language === 'ar' \? 'تم حفظ الطلب' : 'Requirement saved'\)/);
  assert.match(source, /confirmation: \{ alignSelf: 'flex-start'[\s\S]*borderWidth: 1/);
  assert.doesNotMatch(source, /savedBox|person-saved-next-step|person-saved-add-property/);
});