import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('keeps the tab bar in layout and isolates it from dynamic screen content', async () => {
  const [layout, properties, people] = await Promise.all([
    readFile('app/(tabs)/_layout.tsx', 'utf8'),
    readFile('app/(tabs)/index.tsx', 'utf8'),
    readFile('app/(tabs)/people.tsx', 'utf8'),
  ]);

  assert.doesNotMatch(layout, /position:\s*['"]absolute['"]/);
  assert.match(layout, /backgroundColor: isIOS \? ['"]transparent['"] : colors\.background/);
  assert.match(layout, /overflow:\s*['"]hidden['"]/);
  assert.match(layout, /zIndex:\s*100/);
  assert.match(layout, /elevation:\s*12/);
  assert.match(layout, /title: t\('home\.title'\)/);
  assert.match(layout, /title: t\('people\.title'\)/);
  assert.match(layout, /title: t\('matching\.title'\)/);
  assert.doesNotMatch(layout, /propertyType|rental|price|areaName/);

  assert.match(properties, /paddingBottom: insets\.bottom \+ 96/);
  assert.match(properties, /bottom: insets\.bottom \+ 16/);
  assert.match(people, /paddingBottom: insets\.bottom \+ 96/);
  assert.match(people, /bottom: insets\.bottom \+ 16/);
  assert.doesNotMatch(properties, /bottom:\s*insets\.bottom \+ \(Platform\.OS/);
  assert.doesNotMatch(people, /paddingBottom:\s*150/);
});