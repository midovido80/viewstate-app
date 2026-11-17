import test from 'node:test';
import assert from 'node:assert/strict';

import './platformModuleStubs.ts';
import {
  localizedRequirementIssue,
  type LocalizableRequirementIssueCode,
} from '../services/requirementIssueMessage.ts';

const productionCodes: readonly LocalizableRequirementIssueCode[] = [
  'invalid_requirement',
  'required',
  'invalid_identifier',
  'invalid_uuid_v4',
  'invalid_seeker',
  'invalid_purpose',
  'invalid_property_type',
  'invalid_area_list',
  'invalid_area_id',
  'duplicate_area_id',
  'invalid_budget',
  'invalid_currency',
  'invalid_rent_field',
  'invalid_occupancy',
  'buy_rent_field_not_allowed',
  'invalid_amenity',
  'duplicate_amenity',
  'amenities_not_allowed',
  'invalid_catalog_preference',
  'duplicate_catalog_preference',
  'catalog_preference_not_allowed',
  'invalid_floor_use',
];

test('every production Requirement issue has safe English and Arabic copy', () => {
  for (const code of productionCodes) {
    const english = localizedRequirementIssue({ code }, 'en');
    const arabic = localizedRequirementIssue({ code }, 'ar');
    assert.ok(english.length > 0);
    assert.ok(arabic.length > 0);
    assert.notEqual(english, code);
    assert.notEqual(arabic, code);
    assert.ok(!english.includes('requirements.error.'));
    assert.ok(!arabic.includes('requirements.error.'));
  }
});

test('correction-specific issue aliases and unknown issues use localized safe fallbacks', () => {
  const aliases: readonly LocalizableRequirementIssueCode[] = [
    'missing_area_mode',
    'missing_specific_area',
    'invalid_number',
    'invalid_range',
    'master_bedroom_exceeds_bedrooms',
    'incompatible_category_preference',
    'invalid_requirement_draft',
    'save_conflict',
    'save_missing_person',
    'save_non_seeker',
    'save_edit_conflict',
    'save_storage_failure',
    'save_storage_uncertain',
    'save_readback_failed',
    'save_navigation_failed',
  ];
  for (const code of aliases) {
    assert.notEqual(localizedRequirementIssue({ code }, 'en'), localizedRequirementIssue({ code }, 'ar'));
  }
  assert.equal(
    localizedRequirementIssue({ code: 'unexpected_internal_code' as LocalizableRequirementIssueCode }, 'en'),
    'Review the Requirement details and try again.',
  );
  assert.equal(
    localizedRequirementIssue({ code: 'unexpected_internal_code' as LocalizableRequirementIssueCode }, 'ar'),
    'راجع تفاصيل المتطلب وحاول مرة أخرى.',
  );
  assert.equal(localizedRequirementIssue(undefined, 'en'), 'Review the Requirement details and try again.');
});
