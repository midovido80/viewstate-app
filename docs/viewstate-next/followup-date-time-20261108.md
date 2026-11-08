# Follow-up date and time

Applies only to ViewState Next. Original/company app is not updated.

- Manual follow-up creation/editing, rescheduling, and the next follow-up in outcome recording share one Date & time entry.
- Reuses the existing month calendar. Selecting a date keeps the picker open; the time wheels are below it. Confirm commits both; Back/close leaves the previous appointment unchanged. Original Home calendar behavior remains intact.
- Hour/minute wheels use native snapping/drag momentum; 12-hour mode adds AM/PM. The initial format follows expo-localization's device preference (24-hour fallback); the user can change it for this mounted screen. No persisted global clock preference was introduced.
- No time keyboard/text input. Each minute is available. Empty time blocks all three manual save paths, without invalidating/migrating existing any-time records, automatic suggestions, or legacy status changes.
- Storage remains local wall-clock HH:mm plus existing date and Kuwait timezone semantics; 12/24 conversion only affects presentation. The initial 09:00 wheel position is a preview, committed only by confirmation.
- Confirmation/format switching is disabled while wheels settle. Accessibility adjustable increment/decrement actions are available. The wheel row height grows with font scaling. Reduced-motion disables animated programmatic snapping. No dependency or account configuration changes.

## Verification

- Mobile typecheck and property-domain typecheck passed.
- 1,025 mobile tests and 29 matching tests passed. New tests exhaustively round-trip all 1,440 minutes through both formats and check midnight/noon/invalid inputs and bilingual labels.
- Expo web export and Android Hermes JavaScript export passed (no APK/native binary was built). These checks do not prove native worklet gesture execution or device frame rate.
- Local browser verification was attempted, but the browser blocked the local preview with ERR_BLOCKED_BY_CLIENT before loading the app. No visual/browser save/back test is claimed.
- APK/device acceptance is still needed: drag/flick/reverse each wheel, confirm during settling, 12 AM/PM boundaries, cancel after changing both fields, save/reload, reschedule, outcome with next appointment, Arabic RTL, font scaling and reduced motion.

## Research

Firecrawl search succeeded (3 results) but did not establish the exact HONOR 9 clock appearance. Official documentation corroborates clock format choice; the implementation follows the requested alarm-style wheel interaction without claiming an exact OEM reproduction.

- https://www.honor.com/my/support/content/en-us15834482/ (system date/time and 24-hour format)
- https://www.honor.com/uk/knowledge/how-to-set-an-alarm-on-phone/ (alarm hour/minute and AM/PM)
- https://reactnative.dev/docs/0.81/scrollview (snapToInterval, deceleration and momentum callbacks)
