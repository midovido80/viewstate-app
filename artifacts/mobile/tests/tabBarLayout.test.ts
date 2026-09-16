import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('keeps the tab bar in layout and isolates it from dynamic screen content', async () => {
  const [layout, properties, people, home] = await Promise.all([
    readFile('app/(tabs)/_layout.tsx', 'utf8'),
    readFile('app/(tabs)/properties.tsx', 'utf8'),
    readFile('app/(tabs)/people.tsx', 'utf8'),
    readFile('app/(tabs)/index.tsx', 'utf8'),
  ]);

  assert.match(layout, /sceneStyle:\s*\{\s*overflow:\s*['"]hidden['"]/);
  assert.match(layout, /position:\s*['"]relative['"]/);
  assert.doesNotMatch(layout, /position:\s*['"]absolute['"]/);
  assert.match(layout, /backgroundColor: colors\.background/);
  assert.doesNotMatch(layout, /tabBarBackground/);
  assert.match(layout, /overflow:\s*['"]hidden['"]/);
  assert.match(layout, /zIndex:\s*100/);
  assert.match(layout, /elevation:\s*12/);
  assert.match(layout, /title: t\('home\.title'\)/);
  assert.match(layout, /title: t\('properties\.title'\)/);
  assert.match(layout, /title: t\('people\.title'\)/);
  assert.match(layout, /title: t\('matching\.title'\)/);
  assert.match(layout, /title: t\('more\.title'\)/);
  const tabOrder = ['name="index"', 'name="properties"', 'name="matching"', 'name="people"', 'name="more"']
    .map(name => layout.indexOf(name));
  assert.ok(tabOrder.every(index => index >= 0));
  assert.deepEqual(tabOrder, [...tabOrder].sort((left, right) => left - right));
  assert.match(home, /home\.importComingLater/);
  assert.doesNotMatch(home, /contacts|phone/i);
  assert.doesNotMatch(layout, /propertyType|rental|price|areaName/);

  assert.match(properties, /paddingBottom: insets\.bottom \+ 96/);
  assert.match(properties, /bottom: insets\.bottom \+ 16/);
  assert.match(people, /paddingBottom: insets\.bottom \+ 96/);
  assert.match(people, /bottom: insets\.bottom \+ 16/);
  assert.doesNotMatch(properties, /bottom:\s*insets\.bottom \+ \(Platform\.OS/);
  assert.doesNotMatch(people, /paddingBottom:\s*150/);
});