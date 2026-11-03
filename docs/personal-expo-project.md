# Personal Expo project linkage

Base: `07d81b1889c947f89b66c488ea59515f36b0c118` (Preview readiness corrections).

Approved new identity, supplied by the founder's Expo Project details:

| Setting | Value |
| --- | --- |
| Owner | `midovido80` |
| Slug | `viewstate-app` |
| EAS project ID | `d6978e84-7f06-4074-a641-eef1f9b9021c` |
| Android application ID | `com.midovido80.viewstateapp` |

Only app identity fields change in `artifacts/mobile/app.json`. The existing
`internal` APK profile explicitly selects the EAS `preview` environment.
Display name, version 1.0.3 / versionCode 6, SDK 54, native plugins, permissions,
UI, matching, data handling, dependencies and lockfile remain unchanged.

Audit of tracked source found the old owner, EAS ID and Android application ID
only in app.json. There is no configured EAS Update URL, runtimeVersion, channel,
or expo-updates dependency to migrate. No native Android/iOS directory is tracked.
Historical documentation is not rewritten. This does not transfer or delete an
old Expo project, signing credential, build, application or device record.

## Acceptance before an APK build

- In the personal Replit project, verify the exact approved revision and resolved
  Expo config. Confirm the connected Expo account can read this new project.
- Link the intended GitHub repository using the account's supported Expo flow;
  this commit does not grant GitHub access or configure a cloud integration.
- Check both Supabase public variables in the new project's EAS `preview`
  environment, not only Replit Preview. Never place privileged secrets in public
  variables or Git. Do not copy signing credentials from another application.
- Confirm actual Free plan quota and reset date before submitting any build.
  Do not enable billing or a paid build fallback.
- A new Android signing key must be explicitly provisioned for the new package
  in the personal Expo account during the separately approved signing/build step.
  This change neither creates nor replaces a key and cannot verify it exists.
- Native auth still uses `viewstate://auth/callback`; web uses its current Preview
  callback. Verify the Supabase allowlist and a real Google round trip. The
  existing `mobile` and `viewstate` URL schemes are preserved. If an older app
  also registers a scheme, Android may offer more than one handler; native
  acceptance must test this rather than assume the new package isolates links.
  No provider configuration is changed by this linkage package.

The new Android ID installs as a separate app, with a separate local sandbox.
Old local/guest records are not automatically migrated. Google login still uses
the same Supabase project/account, so cloud identity is not made independent by
changing Android ID. Do not uninstall the old app or clear its data.

Rollback: return to the base revision to restore the former build configuration.
This does not downgrade an installed APK, migrate its data or undo cloud changes.
No APK, store publication, EAS Update, schema migration or cloud action is included.
