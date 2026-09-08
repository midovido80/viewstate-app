import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Person details renders Add Property Requirement and Link Property actions as buttons instead of text links', async () => {
  const source = await readFile('app/person/[personId].tsx', 'utf8');
  
  assert.match(source, /<Button\s+title=\{t\('requirements\.add'\)\}.*?testID="person-add-requirement".*?\/>/s);
  assert.doesNotMatch(source, /<TouchableOpacity[^>]*testID="person-add-requirement"/);
  
  assert.match(source, /<Button\s+title=\{t\('people\.link'\)\}.*?testID="person-link-property".*?\/>/s);
  assert.doesNotMatch(source, /<TouchableOpacity[^>]*testID="person-link-property"/);
});

test('Person details requirement card visually separates Type/Usage and Purpose in consistent visual layout', async () => {
  const source = await readFile('app/person/[personId].tsx', 'utf8');
  
  // container should enforce fixed LTR visual direction so Type is left, Purpose is right
  assert.match(source, /<View[^>]*flexDirection:\s*'row'[^>]*justifyContent:\s*'space-between'[^>]*>/);
  assert.match(source, /formatRequirementTypeUsage\(requirement,\s*t\)/);
  // Type/Usage text must be left-aligned
  assert.match(source, /styles\.requirementTitle[^>]*textAlign:\s*'left'/);
  // Purpose text must be right-aligned
  assert.match(source, /textAlign:\s*'right'/);
});

test('Requirement format helper matches approved examples and limitations', async () => {
  const source = await readFile('services/requirementFormat.ts', 'utf8');
  
  // Uses commercialActivity for Shops
  assert.match(source, /commercialActivity/);
  // Uses occupancy for Apartments/family
  assert.match(source, /occupancy/);
  assert.match(source, /!== 'any'/);
  // Fallback to type
  assert.match(source, /propertyType/);
  
  // Limitation documented
  assert.match(source, /Office/i);
  assert.match(source, /contract limitation/i);
  assert.match(source, /domain contract does not support/i);
});
