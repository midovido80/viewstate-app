# Foreground local matching cue

Base: `a761d07c3231868aced72241cf523e5394062c17`; independent branch: `work/local-match-audio`.

## Compatibility before installation

The installed Expo 54.0.37 bundled-native-module metadata selects expo-audio `~1.1.1`. Pin `expo-audio@1.1.1` and explicitly declare its already-locked peer `expo-asset@12.0.13`. A lockfile-only resolution was reviewed before frozen installation: one new underlying npm package, no Expo/React/React Native upgrades. SDK54 source and plugin were inspected rather than applying newer SDK documentation. Native Android dependencies include Media3 1.8.0; adding native audio has a binary footprint and requires a new native build.

## Boundaries

- A generated 0.48-second, 21,212-byte mono PCM WAV is bundled locally. No sound download, service account, paid service or microphone access.
- Lazy guarded native loading; old binaries missing the module fail closed. Audio failure does not fail matching, saving, or navigation.
- One active cue, no loop, no extra polling. Every player/listener is released on completion, error, backgrounding, preference disable, or a 2.5-second watchdog. Late initialization cannot create a player after cancellation.
- Foreground only. No push/background notifications or lockscreen controls. Recording permissions and unused library background services are explicitly removed from generated configuration. Existing Maps/media permissions remain.
- Mix with other audio; do not globally deactivate the audio subsystem. iOS respects silent mode; Android uses media volume. Playback during calls/audio routing still needs device acceptance.
- Sound/quiet settings and test control remain bilingual. Unavailable native audio is reported by the manual test rather than claiming success. Browser sound keeps its existing explicit-user-gesture behavior.

## Validation and remaining acceptance

Controller tests cover unavailable modules, initialization/playback failures, concurrent calls, synchronous and malformed events, cleanup failures, cancellation/backgrounding, watchdogs and 1,000 sequential play/release cycles. Run the existing mobile suite, Domain tests, TypeScript, Expo config introspection and Android/iOS JavaScript export.

These checks do not prove native Gradle/Xcode compilation or physical-device performance. Before accepting the sound on Android/iOS, build a binary containing this module and test enabled/disabled sound, quiet hours, repeated alerts, volume/silent settings, incoming calls, background/resume, and an unavailable audio device. No claim of universal crash-free behavior is made.

## Rollback

No main/Pilot movement is required for this package. The base commit remains the exact pre-audio application. Restore its source and native configuration and rebuild for a full native rollback; hot reload alone does not remove a native dependency from an installed binary. User records and form schemas are untouched.
