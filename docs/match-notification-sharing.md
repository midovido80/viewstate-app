# Foreground matching notifications and share-to-follow-up

Branch: `work/match-notification-sharing`.
Base: `99f85426ed8c2a2c0d1ad47f0967290e9198f442`.
Pilot recorded before work: `ec9c8c621846281a1052486314233f25c7a1ded1`.

## Implemented scope

The existing single matcher supplies both Home's best five and the qualifying notification inventory. Saved store snapshots refresh on navigation, foreground resume and a 30-second active-app check. A changed inventory is rechecked before publishing a computed run, preventing a mixed snapshot from becoming an alert. Unchanged snapshots skip reevaluation, and long requirement loops yield between requests. No scoring policy, commission rule, Property form or Requirement form is changed.

Notification history has a separate validated local namespace, serialized native writes and secure-browser Web Locks. It reloads under its lock, verifies writes and blocks further mutation after an uncertain write until verified reload. A history failure is isolated from matching results. Corrupt/future data is preserved with an error, not replaced with defaults.

First setup and engine-version changes silently baseline existing pairs. Subsequent new pairs or changed comparison facts generate history entries. Names/notes, list reorder and reopening do not generate repeat alerts. Unread notices are never pruned; the most recent 200 read entries are retained. Seen fingerprints survive history pruning. Foreground delivery claims a batch atomically, producing at most one cue and banner for that batch across concurrent writers.

The red bell badge counts unread notifications. The banner shows real comparison evidence and distinguishes differences from missing facts. Not now dismisses the banner but leaves history unread. Notification history groups by client, supports reading and a one-hour foreground reminder, and retains historical entries that are no longer current with an explicit warning. Opening a saved notification for sharing reevaluates current inventory; stale, deleted or changed matches cannot use the old share handoff.

## Share and follow-up

The Yes action opens the existing Property share screen with the intended client. ViewState is the first format choice: a branded text card generated solely from the reviewed preview. This is not account-to-account delivery, a new network service or a structured import protocol. Phone apps use the OS share sheet; the OS controls supported installed targets and their order. Sensitive fields retain their existing default-off selection policy. The primary share action stays visible in a safe-area footer.

After the share UI returns, the app explicitly asks whether the user sent the Property. Only the user's confirmation offers the existing follow-up editor, prefilled with verified Person/Property IDs. No sent/delivered state is inferred, no follow-up is created automatically, and no message is sent by this package.

## Navigation and motion

The settings gear opens `/account`, containing the previous account/settings/privacy/help functions. The redundant visible More tab is hidden, without assigning a replacement. Existing More deep links redirect to the settings hub. The upper three-dot Today actions remain unchanged. The Home bell opens Notification history.

The new banner uses restrained 180ms feedback, bounded scrolling and reachable actions on short screens. Both system Reduce Motion and the app preference disable its animation; Quick Add also respects the app preference. Approved blue/navy identity, red counters/warnings and existing controls are retained. Taste guidance is applied to hierarchy, spacing and states; its generic palette/layout redraw is intentionally not applied to this approved product.

## Audio boundary and proposed independent follow-up

Browser sound uses a short, locally synthesized two-note Web Audio cue, enabled only through an explicit user gesture. Reloading the browser may require enabling audio again. Native uses the already-installed Expo Haptics module. Quiet hours suppress sound/vibration and are interpreted in Kuwait time. Settings explain that these are foreground-only alerts; no push, closed-app reminder or background service is claimed.

Actual Android/iOS audio is **not implemented in this feature branch** because it needs a new dependency and the Founder requires a separate approved infrastructure package. No dependency, lockfile or native configuration has been changed.

Concrete next package for Founder approval: add only SDK-compatible `expo-audio` (the installed Expo dependency map currently specifies `~1.1.1`), one short bundled sound, and a native cue adapter with replay/cleanup/error handling. Review playback-only configuration to avoid microphone/background-recording permissions, preserve quiet hours and sound opt-out, run frozen install/CI/exports, and leave any APK build for its own authorization. Do not install the latest SDK's audio version blindly. The package uses local playback, not a paid service.

## Acceptance limits

Pure tests cover baselining, deduplication, material changes, claim-once delivery, reload/concurrent writes, corrupt/uncertain storage, reminder boundaries, quiet hours and safe sharing handoffs. Existing Mobile, Domain/Matching and TypeScript gates remain required.

Local HTTP browser QA can verify rendering, navigation, language and explicit Web Audio initialization; Web Locks/secure Expo UUID are unavailable there. Banner visual QA uses a clearly labelled disposable fixture only in the separate local QA checkout, never in app data or production routes. Secure Replit must still exercise actual new-match creation, persistence/reopen, banner/share/follow-up and touch scrolling. Native vibration, audio playback and real installed-app share targets need device acceptance. JavaScript/Hermes export is not an APK or a device test.

No Replit refresh, Pilot/main advancement, deployment, cloud/SMS activation or APK belongs to this package.
