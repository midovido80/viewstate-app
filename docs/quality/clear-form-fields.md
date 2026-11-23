# Clear form fields

Starting checkpoint: `260aa325604cbe98086109970dc84154dc73f39b`.
Branch: `work/clear-form-fields`.

## Approved appearance

- Empty and filled, inactive: white surface, visible slate outline, 12px corners.
- Focused: full pale blue-gray surface with a blue outline. Only the active input changes; blur returns its ordinary surface.
- Invalid: pale red surface and red outline take priority over focus. Existing required stars, error messages and automatic scroll remain in place.
- Noneditable: neutral gray surface. No green success marker or new required-field rule is introduced.

## Coverage and behavior

All application TextInput imports under app/components now resolve to the shared forwarding component. This covers capture/enrichment/editing, residential/commercial profiles, requirements, people/contact import, matching/search, guest/account profiles, settings and assistant task fields.

Area dropdowns, the legacy capture area selector, phone-country selectors and account classification use the same field surface while their picker is open or keyboard-focused. Choice tiles, filters, map/media action buttons and read-only detail cards retain their existing behavior and design.

The native input and forwarded ref are preserved, including keyboard/selection/multiline props, onChangeText, and composed focus/blur callbacks. Caller heights, padding and text direction remain authoritative. No viewport wrapper or scrolling/keyboard component is added to production. Nested picker search does not inherit an unrelated missing-area error.

No dependency or lockfile change, data migration, storage/matching/auth-rule change, cloud setting, signing change or APK build is included. The package test command adds only the new regression test file.

## Verification

- 888 Mobile tests passed, including five focused regressions for focus/blur and value/ref preservation, error precedence/recovery, readonly/compact dimensions, dropdown callbacks and global input coverage.
- 27 Domain tests passed.
- Full workspace TypeScript passed.
- Android and iOS JavaScript exports passed; these are not native installation tests.
- Local 390px web fixture checked English/Arabic input states, area search/selection, retained values, blur callback execution, and required-error appearance. A rent input retained a 52px height across focus; compact search retained 40px. The fixture is outside the repository and is not shipped.

Local Preview runs on HTTP, where the pre-existing draft initializer reports unavailable secure-context randomUUID. Consequently the fixture validates UI state, not complete production saved-record journeys. Personal HTTPS Replit, mobile keyboard/gesture behavior and physical-device acceptance remain pending. No Founder business records were used.

## Recovery

This package is an isolated child of the starting checkpoint. Previous branches are retained; Preview can return to its recorded previous SHA without rewriting main or Pilot. Do not clear user data during synchronization or rollback.
