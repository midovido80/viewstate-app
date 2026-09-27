import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Person primary actions follow assigned classifications and keep one Home action', async () => {
  const source = await readFile('app/person/[personId].tsx', 'utf8');

  assert.match(source, /const primaryActionTitle = \(classification: PersonClassification\)/);
  assert.match(source, /classification === 'seeker'.*Add Requirement/s);
  assert.match(source, /classification === 'owner'.*Add Offered Property/s);
  assert.match(source, /getPersonWantedRequirementRoute\(person\.id\)/);
  assert.match(source, /pathname: '\/capture\/transaction',\s*params: \{ mode: 'wanted', seekerId: personId \}/);
  assert.match(source, /linkPersonId: person\.id, sourceRole: 'owner'/);
  assert.match(source, /person\.classifications\.length > 1/);
  assert.match(source, /person\.classifications\.map\(classification =>/);
  assert.match(source, /eligibleSourceRoles/);
  assert.equal((source.match(/testID="person-home"/g) ?? []).length, 1);
  assert.match(source, /flexDirection: isRTL \? 'row-reverse' : 'row'/);
  assert.match(source, /language === 'ar' \? 'اختر الإجراء' : 'Choose action'/);
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