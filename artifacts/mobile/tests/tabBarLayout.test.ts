import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { screenInsets, isMissingPositiveAmount } from '../services/screenInsets';
import palette from '../constants/colors';

test('custom screen controls clear cutouts and both Android navigation modes', () => {
  for (const device of [
    { top: 24, bottom: 0, left: 0, right: 0 },
    { top: 32, bottom: 24, left: 0, right: 0 },
    { top: 48, bottom: 48, left: 0, right: 0 },
  ]) {
    const spacing = screenInsets(device, 'android', 390, 24);
    assert.ok(spacing.top >= device.top + 8);
    assert.ok(spacing.bottom >= device.bottom + 12);
    // The entire 48px action stays above the OS navigation area on a short display.
    const buttonBottom = 640 - spacing.bottom;
    assert.ok(buttonBottom <= 640 - device.bottom - 12);
    assert.ok(buttonBottom - 48 > spacing.top + 48);
  }
  assert.equal(screenInsets({ top: 0, bottom: 0, left: 0, right: 0 }, 'android', 390, 28).top, 36);
});

test('browser fallback is narrow-screen only and never reduces measured safe areas', () => {
  const zero = { top: 0, bottom: 0, left: 0, right: 0 };
  assert.deepEqual(screenInsets(zero, 'web', 390), { top: 56, bottom: 32, left: 0, right: 0 });
  assert.deepEqual(screenInsets(zero, 'web', 1200), { top: 8, bottom: 12, left: 0, right: 0 });
  const cutout = { top: 59, bottom: 34, left: 4, right: 4 };
  for (const platform of ['web', 'ios']) {
    assert.deepEqual(screenInsets(cutout, platform, 390), { top: 67, bottom: 46, left: 4, right: 4 });
  }
});

test('ordinary data uses navy while invalid required amounts retain error styling', () => {
  assert.equal(palette.light.accent, '#173F78');
  assert.equal(palette.light.destructive, '#E11D48');
  for (const value of [undefined, null, '', ' ', 0, -1, NaN, Infinity, 'bad']) assert.equal(isMissingPositiveAmount(value), true);
  for (const value of [1, '500', 1500.5]) assert.equal(isMissingPositiveAmount(value), false);
});

test('headers and fixed actions consume the shared safe spacing and tab height reserves its padding', async () => {
  const [root, tabs, detail, header, footer, studio] = await Promise.all([
    readFile('app/_layout.tsx', 'utf8'),
    readFile('app/(tabs)/_layout.tsx', 'utf8'),
    readFile('app/property/[propertyCoreId].tsx', 'utf8'),
    readFile('components/CaptureHeader.tsx', 'utf8'),
    readFile('components/PropertyReview.tsx', 'utf8'),
    readFile('app/capture/studio.tsx', 'utf8'),
  ]);
  assert.match(root, /initialMetrics=\{initialWindowMetrics\}/);
  assert.match(tabs, /height: 80 \+ insets.bottom/);
  for (const source of [detail, header, footer, studio]) assert.match(source, /useScreenInsets\(\)/);
  for (const source of [detail, footer]) assert.doesNotMatch(source, /#AE313B/);
});

test('keeps the tab bar in layout and isolates it from dynamic screen content', async () => {
  const [layout, properties, people, home, assistant] = await Promise.all([
    readFile('app/(tabs)/_layout.tsx', 'utf8'),
    readFile('app/(tabs)/properties.tsx', 'utf8'),
    readFile('app/(tabs)/people.tsx', 'utf8'),
    readFile('app/(tabs)/index.tsx', 'utf8'),
    readFile('components/assistant/CompactAssistantScreen.tsx', 'utf8'),
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
  assert.match(home, /export default CompactAssistantScreen/);
  assert.match(assistant, /h\.notify\(C\('importLater'\)\)/);
  assert.doesNotMatch(assistant, /requestPermissionsAsync|expo-contacts/);
  assert.doesNotMatch(home, /contacts|phone/i);
  assert.doesNotMatch(layout, /propertyType|rental|price|areaName/);

  assert.match(properties, /paddingBottom: insets\.bottom \+ 96/);
  assert.match(properties, /bottom: insets\.bottom \+ 16/);
  assert.match(people, /paddingBottom: insets\.bottom \+ 96/);
  assert.match(people, /bottom: insets\.bottom \+ 16/);
  assert.doesNotMatch(properties, /bottom:\s*insets\.bottom \+ \(Platform\.OS/);
  assert.doesNotMatch(people, /paddingBottom:\s*150/);
});

test('share, person capture and Requirement save actions also reserve the bottom safe area', async () => {
  const [share, person, requirement] = await Promise.all([
    readFile('app/property/[propertyCoreId]/share.tsx', 'utf8'),
    readFile('app/person/new.tsx', 'utf8'),
    readFile('app/requirement/[requirementId].tsx', 'utf8'),
  ]);
  assert.match(share, /paddingTop: insets\.top/);
  for (const source of [share, person]) assert.match(source, /paddingBottom: insets\.bottom \+ 24/);
  assert.doesNotMatch(requirement, /<View style=\{styles\.footer\}>/);
  assert.match(requirement, /paddingBottom: Math\.max\(insets\.bottom, 16\)/);
});
