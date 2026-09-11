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

test('aggregate property types suppress unitCount in enrichment and active details only', async () => {
  const [fields, enrich, details, sharing] = await Promise.all([
    readFile('components/PropertyEnrichmentFields.tsx', 'utf8'),
    readFile('app/property/[propertyCoreId]/enrich.tsx', 'utf8'),
    readFile('app/property/[propertyCoreId].tsx', 'utf8'),
    readFile('../../lib/property-domain/src/sharing.ts', 'utf8'),
  ]);
  assert.match(fields, /definition\.field === 'unitCount' && suppressUnitCountForPropertyType\(propertyType\)/);
  assert.match(fields, /propertyType === 'whole_building' \|\| propertyType === 'commercial_complex'/);
  assert.match(details, /definition\.field === 'unitCount' && suppressUnitCountForPropertyType\(property\.core\.propertyType\)/);
  assert.match(enrich, /if \(definition\.field === 'unitCount' && suppressUnitCount\) return;/);
  assert.match(enrich, /if \(key === 'unitCount' && suppressUnitCount\) return;/);
  assert.match(sharing, /definition\.field === "unitCount"/);
  assert.match(sharing, /property\.core\.propertyType === "whole_building"/);
});

test('aggregate unitCount preservation skips deletion and newly writing the hidden field', async () => {
  const source = await readFile('app/property/[propertyCoreId]/enrich.tsx', 'utf8');
  const deletionGuard = /PROPERTY_DETAIL_FIELD_DEFINITIONS\.forEach\(definition => \{\s*if \(definition\.field === 'unitCount' && suppressUnitCount\) return;\s*delete rawDetails\[definition\.field\];/;
  const writeGuard = /applicableDefinitions\.forEach\(\(\{ field: key \}\) => \{\s*\/\/ Aggregate types no longer accept unitCount as an enrichment input\.\s*\/\/ Deliberately leave an existing baseline value untouched for legacy\s*\/\/ records, while preventing new writes\.\s*if \(key === 'unitCount' && suppressUnitCount\) return;/;
  assert.match(source, deletionGuard);
  assert.match(source, writeGuard);
});

test('classified enrichment fields remain independent of unitCount suppression', async () => {
  const [fields, enrich] = await Promise.all([
    readFile('components/PropertyEnrichmentFields.tsx', 'utf8'),
    readFile('app/property/[propertyCoreId]/enrich.tsx', 'utf8'),
  ]);
  assert.match(fields, /'intendedUse', 'commercialActivity', 'clarification'/);
  assert.match(enrich, /optionalClassifiedLiteral\(paci, exactPrivacy\)/);
  assert.match(enrich, /optionalClassifiedLiteral\(manualLocation, exactPrivacy\)/);
  assert.match(enrich, /optionalClassifiedLiteral\(validatedMapsLink \?\? '', exactPrivacy\)/);
});

test('VAPP-47 presentation colors stay scoped without replacing semantic theme tokens', async () => {
  const [colorSource, hookSource] = await Promise.all([
    readFile('constants/colors.ts', 'utf8'),
    readFile('hooks/useColors.ts', 'utf8'),
  ]);

  assert.match(colorSource, /light:\s*\{[\s\S]*?background:[\s\S]*?foreground:/);
  assert.match(colorSource, /vapp47:\s*\{[\s\S]*?brandPrimary:[\s\S]*?homeCardRadius:[\s\S]*?homeShadow:/);
  assert.match(hookSource, /\.\.\.colors\.light/);
  assert.match(hookSource, /vapp47:\s*colors\.vapp47/);
});

test('Phase 1 Home keeps real actions, local data truthfulness, and property identity', async () => {
  const source = await readFile('app/(tabs)/index.tsx', 'utf8');

  assert.match(source, /testID="home-action-add-property"[\s\S]*?title=\{t\('home\.new'\)\}/);
  assert.match(source, /onPress=\{\(\) => router\.push\('\/capture\/transaction'/);
  assert.match(source, /onPress=\{\(\) => router\.push\('\/person\/new'[\s\S]*?testID="home-action-add-person"/);
  assert.match(source, /onPress=\{\(\) => router\.push\('\/person\/new'[\s\S]*?testID="home-action-contact-entry"/);
  assert.match(source, /onPress=\{\(\) => router\.push\('\/matching'[\s\S]*?testID="home-action-matches"/);
  assert.doesNotMatch(source, /router\.push\(['"`]\/requirement\/new/);

  assert.match(source, /router\.push\(`\/property\/\$\{encodeURIComponent\(item\.core\.id\)\}`/);
  assert.match(source, /propertyId=\{item\.core\.id\}/);
  assert.match(source, /keyExtractor=\{item => item\.core\.id\}/);

  assert.match(source, /const allProperties = await store\.getProperties\(\)/);
  assert.match(source, /setPropertyCount\(allProperties\.length\)/);
  assert.match(source, /await store\.searchProperties\(query\)/);
  assert.match(source, /store\.getPeople\(\)/);
  assert.match(source, /store\.getRequirements\(\)/);
  assert.match(source, /peopleResult\.status === 'fulfilled' \? peopleResult\.value\.length : null/);
  assert.match(source, /requirementsResult\.status === 'fulfilled' \? requirementsResult\.value\.length : null/);

  assert.match(source, /propertyCount === 0[\s\S]*?testID="home-properties-empty"/);
  assert.match(source, /testID="home-properties-no-results"/);
  assert.doesNotMatch(source, /router\.push\([^)]*trust[_/-]?circle/i);
});

test('Phase 1 Home translations remain bilingual in the canonical namespace', async () => {
  const source = await readFile('contexts/I18nContext.tsx', 'utf8');
  const expectedEntries = [
    ["home.quick_actions", "Quick Actions", "إجراءات سريعة"],
    ["home.workspace_summary", "Workspace Summary", "ملخص مساحة العمل"],
    ["home.loading", "Loading…", "جارٍ التحميل…"],
    ["home.no_results", "No matching properties found", "لا توجد عقارات مطابقة لبحثك"],
    ["home.trust_circle", "Trust Circle", "دائرة الثقة"],
    ["home.trust_circle_unavailable", "Not available yet", "غير متاح حاليًا"],
  ];

  for (const [key, english, arabic] of expectedEntries) {
    assert.match(source, new RegExp(`'${key}': '${english}'`));
    assert.match(source, new RegExp(`'${key}': '${arabic}'`));
  }

  assert.doesNotMatch(source, /['"]home\.phase1\./);
  assert.match(source, /AsyncStorage\.getItem\('@viewstate_language'\)/);
  assert.match(source, /AsyncStorage\.setItem\('@viewstate_language', lang\)/);
  assert.match(source, /const isRTL = language === 'ar'/);
});

test('Phase 1 informational and future presentation primitives remain non-actionable', async () => {
  const source = await readFile('components/HomePrimitives.tsx', 'utf8');
  const summaryContract = source.match(
    /interface HomeSummaryCardProps[\s\S]*?interface HomeFutureCardProps/,
  )?.[0];
  const futureContract = source.match(
    /interface HomeFutureCardProps[\s\S]*?interface HomePropertyCardProps/,
  )?.[0];

  assert.ok(summaryContract);
  assert.doesNotMatch(summaryContract, /onPress/);
  assert.ok(futureContract);
  assert.match(futureContract, /accessibilityState=\{\{ disabled: true \}\}/);
  assert.doesNotMatch(futureContract, /<Pressable|onPress/);
});
