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

test('Person Quick Add closes its own Link Property modal before preserving linked capture navigation', async () => {
  const source = await readFile('app/person/[personId].tsx', 'utf8');
  const quickAddButton = source.match(
    /<Button\s+title=\{t\('people\.quick_add_property'\)\}.*?testID="person-quick-add-property"\s*\/>/s,
  )?.[0];

  assert.ok(quickAddButton, 'Quick Add button must remain identifiable by its own title and testID');
  assert.match(
    quickAddButton,
    /onPress=\{\(\) => \{\s*setLinkOpen\(false\);\s*router\.push\(\{ pathname: '\/capture\/transaction', params: \{ linkPersonId: person\.id \} \} as never\);\s*\}\}/s,
  );
  assert.doesNotMatch(quickAddButton, /store\.|saveProperty|linkPersonToProperty/);

  assert.match(
    source,
    /await store\.linkPersonToProperty\(\{ personId: person\.id, propertyCoreId: property\.core\.id \}\);\s*setLinkOpen\(false\);\s*await load\(\);/s,
  );
  assert.match(source, /<Modal visible=\{linkOpen\} animationType="slide" onRequestClose=\{\(\) => setLinkOpen\(false\)\}>/);
  assert.match(
    source,
    /<Button title=\{t\('capture\.cancel'\)\} onPress=\{\(\) => setLinkOpen\(false\)\} variant="outline" testID="link-property-cancel" \/>/,
  );
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
