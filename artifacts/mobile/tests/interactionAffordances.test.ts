import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attachmentFileExists } from '../services/attachmentOperations.ts';

test('Property Details presents saved Maps, Photo, Video, and PDF resources as visible controls', async () => {
  const source = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  assert.match(source, /<ResourceRow[\s\S]*?icon="map-pin"[\s\S]*?testID="property-open-maps"/);
  assert.match(source, /property\.attachments\?\.map\(attachment =>/);
  assert.match(source, /attachment\.kind === 'image' \? 'image' : attachment\.kind === 'video' \? 'play-circle' : 'file-text'/);
  assert.match(source, /style=\{\(\{ pressed \}\) =>/);
  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /name=\{isRTL \? 'chevron-left' : 'chevron-right'\}/);
  assert.doesNotMatch(source, /<Text[^>]*>\s*\{attachment\.managedUri\}/);
});

test('Photo preview is in-app, closes on Android back, and retains a device opener fallback', async () => {
  const source = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  assert.match(source, /visible=\{previewImage !== null\}/);
  assert.match(source, /onRequestClose=\{\(\) => setPreviewImage\(null\)\}/);
  assert.match(source, /testID="property-image-preview-close"/);
  assert.match(source, /testID="property-image-preview-system"/);
  assert.match(source, /openPropertyAttachment\(failedPreview, true\)/);
  assert.match(source, /attachmentFileExists\(attachment\.managedUri\)/);
});

test('missing attachment probes fail closed for false and unreadable files', async () => {
  assert.equal(await attachmentFileExists('file://missing', {
    fileExists: async () => false,
  }), false);
  assert.equal(await attachmentFileExists('file://unreadable', {
    fileExists: async () => {
      throw new Error('unreadable');
    },
  }), false);
  assert.equal(await attachmentFileExists('file://present', {
    fileExists: async () => true,
  }), true);
});

test('Match and linked entity destinations expose labels, chevrons, and stale states', async () => {
  const [matching, person, property] = await Promise.all([
    readFile('app/(tabs)/matching.tsx', 'utf8'),
    readFile('app/person/[personId].tsx', 'utf8'),
    readFile('app/property/[propertyCoreId].tsx', 'utf8'),
  ]);
  assert.match(matching, /disabled=\{!property\}/);
  assert.match(matching, /accessibilityState=\{\{ disabled: !property \}\}/);
  assert.match(matching, /'matching\.results\.openProperty'/);
  assert.match(matching, /'matching\.results\.openPerson'/);
  assert.match(person, /people\.open_linked_property/);
  assert.match(person, /source\.open_property/);
  assert.match(person, /linked-property-unavailable-/);
  assert.match(person, /source-property-unavailable-/);
  assert.doesNotMatch(person, />\{toEnglishDigits\(property\.core\.id\)\}<\/Text>/);
  assert.match(property, /property-source-unavailable/);
});

test('Phone and WhatsApp remain explicit buttons while descriptive values remain static', async () => {
  const source = await readFile('app/person/[personId].tsx', 'utf8');
  assert.match(source, /<Button title=\{t\('people\.whatsapp'\)\}/);
  assert.match(source, /<Button title=\{t\('people\.call'\)\}/);
  assert.match(source, /<Text style=\{\[styles\.phone/);
  assert.match(source, /<Text style=\{\{ color: colors\.foreground, textAlign:[\s\S]*?\}\}>\{formatPrice/);
});

test('attachment edit actions and bilingual resource labels include accessible names', async () => {
  const [enrich, i18n] = await Promise.all([
    readFile('app/property/[propertyCoreId]/enrich.tsx', 'utf8'),
    readFile('contexts/I18nContext.tsx', 'utf8'),
  ]);
  assert.match(enrich, /accessibilityLabel=\{accessibilityLabel \?\? title\}/);
  assert.match(enrich, /`\$\{labels\.open\}: \$\{attachment\.originalName\}`/);
  assert.match(enrich, /writingDirection: 'ltr'/);
  assert.match(i18n, /'resources\.image': 'Photo'/);
  assert.match(i18n, /'resources\.image': 'صورة'/);
  assert.match(i18n, /'resources\.destination_unavailable': 'Destination unavailable'/);
  assert.match(i18n, /'resources\.destination_unavailable': 'الوجهة غير متاحة'/);
});