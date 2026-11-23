import test from 'node:test';
import assert from 'node:assert/strict';
import { circleInviteToken, circleInviteMessage, canInvitePerson } from '../services/circleInvitations';
test('invite parser accepts only owned invitation links or raw capability tokens', () => {
  const token = 'ab'.repeat(32);
  assert.equal(circleInviteToken('viewstate://circle-invite/' + token), token);
  assert.equal(circleInviteToken('https://taduvwcajtjpceavlxrc.supabase.co/functions/v1/circle-invite?token=' + token), token);
  assert.equal(circleInviteToken('https://evil.example/?token=' + token), null);
  assert.equal(circleInviteToken(token), token);
  assert.equal(circleInviteToken('abc'), null);
});
test('invitation copy contains circle and inviter name, no internal account identifier', () => {
  const message = circleInviteMessage('أحمد', 'زملاء المكتب', 'https://example.test/invite', 'ar');
  assert.match(message, /أحمد/); assert.match(message, /زملاء المكتب/);
  assert.ok(canInvitePerson(['broker']));
  assert.ok(canInvitePerson(['real_estate_company']));
  assert.ok(canInvitePerson(['property_management']));
  assert.equal(canInvitePerson(['rent_seeker']), false);
});
