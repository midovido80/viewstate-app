import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('keeps the tab bar in layout and isolates it from dynamic screen content', async () => {
  const [layout, home, properties, people] = await Promise.all([
    readFile('app/(tabs)/_layout.tsx', 'utf8'),
    readFile('app/(tabs)/index.tsx', 'utf8'),
    readFile('app/(tabs)/properties.tsx', 'utf8'),
    readFile('app/(tabs)/people.tsx', 'utf8'),
  ]);

  assert.match(layout, /sceneStyle:\s*\{\s*overflow:\s*['"]hidden['"]/);
  assert.match(layout, /position:\s*['"]relative['"]/);
  assert.doesNotMatch(layout, /position:\s*['"]absolute['"]/);
  assert.match(layout, /backgroundColor: colors\.background/);
  assert.doesNotMatch(layout, /tabBarBackground/);
  assert.match(layout, /overflow:\s*['"]hidden['"]/);
  assert.match(layout, /zIndex:\s*100/);
  assert.match(layout, /elevation:\s*12/);
  assert.match(layout, /nativeTabBarBaseHeight \+ nativeBottomInset/);
  assert.match(layout, /paddingBottom: isWeb \? 6 : nativeBottomInset/);
  assert.match(layout, /title: t\('home\.title'\)/);
  assert.match(layout, /title: t\('properties\.title'\)/);
  assert.match(layout, /title: t\('people\.title'\)/);
  assert.match(layout, /title: t\('matching\.title'\)/);
  assert.match(layout, /title: t\('brain\.title'\)/);
  assert.match(layout, /name="index"[\s\S]*name="properties"[\s\S]*name="people"[\s\S]*name="matching"[\s\S]*name="brain"/);
  assert.doesNotMatch(layout, /propertyType|rental|price|areaName/);

  assert.doesNotMatch(home, /testID="input-search"|testID="btn-capture"|property-card-/);
  assert.match(properties, /paddingBottom: 96/);
  assert.match(properties, /bottom: 16/);
  assert.match(people, /paddingBottom: 96/);
  assert.match(people, /bottom: 16/);
  assert.doesNotMatch(properties, /bottom:\s*insets\.bottom/);
  assert.doesNotMatch(people, /bottom:\s*insets\.bottom/);
  assert.doesNotMatch(people, /paddingBottom:\s*150/);
});