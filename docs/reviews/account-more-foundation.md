# Account / More foundation

## Acceptance and safety boundary

Reference: `docs/design/account-more-approved-demo.html`. The reference is an interactive
visual specification, not authentication code to port. This native foundation preserves
the reference's bilingual cards, account navigation and settings interactions without
its fixed verification code, local identity matching, fake linked providers or simulated
account deletion.

Profile and preferences are a **device-local presentation**, not an authenticated user,
workspace or ownership boundary. Existing property/person/requirement/media stores are
unchanged. A separate versioned settings namespace stores profile, sharing-example
defaults, notification preferences, reduced motion and feedback drafts. Language uses
the existing app language mechanism as well as the versioned preference. Malformed or
future-version settings block settings writes and are preserved; no hydration rewrites.

## Implemented capability boundaries

- Profile edits and settings persist locally, with explicit failure states.
- Sharing preferences apply **only to the clearly labelled fictional preview**. They
  do not alter the current property share pipeline. Per-preview overrides do not
  change saved defaults. No send action or simulated success is presented.
- Notification preferences are retained for future use. No push subscription, scheduled
  notification, delivery, marketing enrollment or permission request is made.
- Permission status is read from installed native modules / browser APIs where exposed.
  Unknown or unavailable is not relabelled as denied/granted. OS settings only open on
  an explicit user action. Browser settings have instructions instead.
- Feedback is a local draft, **NOT SENT**, not a support ticket. No support endpoint,
  invented support address, or delivery claim.
- No complete property/media backup, restore or cloud sync capability was found. This
  foundation does not implement or mislabel a settings/profile export as a backup.
- About uses the actual Expo application configuration version, not the Expo Go host
  version or a claim about an installed APK. A configured Android build is shown only
  when exposed by the runtime configuration (web may omit it). Policy/terms text is
  explicitly an unapproved draft.
- Clear-local-profile/settings confirmation affects only this new namespace. It does
  not delete a real account or any property, person, requirement or media.

## Real authentication: intentionally unavailable

Read-only inspection found no implemented app authentication provider/session middleware,
no connected authentication integration, and no configured Clerk/Supabase/Firebase
authentication credentials among the checked keys. No credentials were read or changed.
The existing Expo/GitHub developer connections are not app end-user authentication.

The provider interface is intentionally unconfigured. Phone, Google and Apple cannot
authenticate or link an identity. Welcome/provider/onboarding presentation is optional;
existing app use remains available without signing in. There is no OTP bypass,
password collection, local identity verification or fake Google/Apple success.

Before a separately approved infrastructure package can activate authentication:

1. Choose and configure an approved provider, redirect/deep-link IDs, consent, verified
   phone/OAuth flows and abuse controls; approve any SMS or provider cost.
2. Validate issued tokens server-side, manage secure native sessions/refresh/revocation,
   and define session expiry and recovery. Never put bearer credentials in AsyncStorage.
3. Implement and test account-owned data isolation, ownership checks and a safe migration
   plan for existing device-scoped data and media. Account switching, logout and deletion
   must not expose, orphan, merge or erase another user's records.
4. Define export/backup/restore completeness (including attachments), retention/deletion,
   cloud behavior and approved legal/support text before presenting them as available.

No new dependencies, SDKs, secrets, backend schema/projects, cloud activation, paid
resources, real SMS or toolchain changes belong to this foundation.

## Verification

Focused tests cover versioned roundtrip, isolated storage, sensitive defaults, serialized
writes, write failure recovery, malformed/future data preservation, feedback NOT SENT,
per-share overrides, local reset isolation, unavailable authentication and read-only
permission status. Browser and required-suite results are reported with delivery.
Physical native permission/photo/settings behavior requires device validation and is
not established by web Preview.

### Completed bounded browser review

An isolated fresh browser context, without Founder records, verified English 390px and
Arabic RTL 402px (plus Arabic 390px overflow): profile required-name validation,
save/reload, unsaved edit keep/discard, sharing defaults persistence, independent fictional
preview overrides, language and reduced-motion reload, notification unavailability,
permission status/refresh without prompts, data capability limitations, local feedback
validation/persistence/NOT SENT/removal, unavailable provider screens and local reset
cancel/confirm. Only disposable profile/settings/feedback were entered; no property,
person, requirement or source records were created or changed.

The initial web modal fade left translucent remnants in immediate dismissal captures.
Account modals now dismiss without web animation (native respects reduced motion).
Focused English/Arabic repeated preview dismissals and Help-guide dismissal passed,
including immediate and settled screenshots. No uncaught browser exception was observed.
The pre-existing app-wide `direction` diagnostic and deprecation warnings remain outside
this scope. Phone/Google/Apple availability screens collect no sign-in credentials.

Native Android/iOS photo selection, platform settings, physical keyboard/back/gestures
and APK behavior remain unverified. Explicit Android Back, dirty-profile gesture guard,
keyboard avoidance and safe-area handlers are implemented and source-checked; this is
not a claim of physical-device acceptance.

Final local gates: 773/773 Mobile tests (including 16 foundation-focused tests),
Property Domain test command including 25/25 matching-core tests, Mobile TypeScript,
full-workspace TypeScript and changed-file whitespace all passed. No dependency,
lockfile, app configuration, existing storage format or backend changes were needed.
