# Trust circle Android acceptance

The circle handles explicit sale and rental shares for the property types supported by the existing forms. Review the request and listing projections before publishing. The private workspace sync refreshes facts of existing published listings and withdraws shared records when a synchronized original is deleted. Verify a price/specification edit reaches a colleague's catalog after sync and invalidates matching, while private notes stay private. Withdraw one of several circle shares, edit its source again, and verify it stays withdrawn. Use a representative residential and commercial case for each transaction before the scale run.

## Test environment

1. Use a Supabase test environment with the circle inventory, lifecycle, matching delivery, expanded types, listing management and cooperation migrations applied in order. Apply the migrations before using the circle screens.
2. Bundle `supabase/functions/circle-match-worker/index.ts` into a single ESM file before deployment so the same TypeScript domain engine ships with the worker. From the workspace, use the esbuild executable from the pinned pnpm dependency tree with `--bundle --platform=neutral --format=esm`. Deploy the bundled file as `index.ts` under `circle-match-worker`. Its custom bearer check requires gateway JWT verification to be disabled for this function. Set a randomly generated `CIRCLE_WORKER_SECRET` in Edge Functions secrets. The worker uses the project's server-side service role. If enhanced Expo push security is enabled, set `EXPO_ACCESS_TOKEN` in the same server secret store.
3. Store the full Pilot worker HTTPS URL as `circle_worker_url` in Supabase Vault. Store the same dedicated bearer configured in step 2 as `circle_worker_secret`. Run `scripts/enable-circle-worker-delivery.sql` as the database operator. The script wires a private database webhook and a one-minute retry job. Use a project-specific URL and secret. Check `cron.job_run_details`, worker aggregate results and the outbox without printing request headers or device tokens.
4. Supply the Android Firebase configuration as the `GOOGLE_SERVICES_JSON` file environment variable for the internal build and configure the corresponding FCM credentials in Expo. Use the existing app identity and Google OAuth callback for the test build. Install the internal APK on three Android devices or supported Android environments with Google Play Services and three distinct Google test accounts.

## Device journey

The [23 November remediation report](../releases/claude-report-fixes-20261123.ar.md) records pending source changes and their deployment boundaries. Its worker claim RPC changes shape, so deploy the worker and its migration together. Before enabling the new Android client, apply the push-capability migration. Verify online registration, offline logout from A, signed-out retry, and login as B using the same token: old revocation must not remove B's registration, and delayed A activation must not restore A. Legacy registrations without a capability require their original owner's session for retry until upgraded.

Phone invitation responses acknowledge processing, not delivery. Pending/revoked phone invitations stay hidden from the sender's member list and direct membership reads until the recipient accepts. The limit is ten attempts per owner per 24 hours. Verify both missing and verified numbers produce the same sender-visible state before acceptance. Use WhatsApp for current accounts without verified Auth phones; do not treat a contact-profile phone as verified.

Verify request limits of 200 per member and 2000 per circle, including edits/withdrawal at capacity. Verify the sender cannot repeat a declined cooperation for 24 hours. Invitation links remain single-use bearer links; owner approval remains a product decision.

For damaged sync history, use the explicit recovery action and confirm a verified account-local backup exists before rebuilding. Review every difference, including deletion versus presence. Re-edit a record during review and ensure its decision reopens. No local/cloud record should change until all differences have explicit resolutions.

- In Matching, open Trust circle matching and enable notifications on A and B. A creates a circle and invites B by the account ID shown in the app. C has no membership. B accepts and C declines a later invitation. Verify C cannot read the catalog through the authenticated API, including with the circle ID.
- B chooses a saved request and shares it for automatic matching. A chooses and publishes a compatible listing. Verify B can run Match now in circle and that A and B can refresh the server results. Verify C has neither access nor an outbox entry. Send and respond to a cooperation request. Verify that its notification opens the Trust Circle surface while signed into an authorized account.
- Confirm actual push arrival on Android with the app in foreground, background and normally closed. Record device receipt timestamps separately from Expo ticket acceptance. Repeat the webhook and verify there are no duplicate outbox records. A transport timeout after provider acceptance is ambiguous and can cause a duplicate delivery on retry.

- Take A offline. Change the listing to rented, then reconnect. Verify the stale match disappears from the shared results after sync. Repeat with deletion and a stale publish retry. A later retry must not resurrect the deleted listing.
- Confirm a cooperation completion from both accounts and verify the owner’s final status is reflected in the shared listing. Repeat with a declined request and a closed collaboration.
- Record times for publish, first visible server result, and first visible phone notification. Use synthetic listings and avoid exporting contact details or tokens with evidence.

The worker sends a stable Android `tag` derived from the notification notice ID (or delivery ID when no notice exists). Expo maps this to FCM's notification tag, replacing an already displayed notification with that identity on retry. This reduces duplicate tray entries; it does not guarantee one sound, suppress a repeated notification after dismissal, or close the send-before-ticket-record crash window. A provider acceptance followed by a lost response or worker interruption can still cause a second send. Retries can deliver more than once, and provider delivery remains best effort with bounded retries; physical Android checks must cover background and normally closed app behavior. See [Expo's message request format](https://docs.expo.dev/push-notifications/sending-notifications/#message-request-format). No `collapseId` is used to avoid coalescing distinct notifications in transit.

The PostgreSQL harness runs the real migrations, matching engine, role checks and outbox transitions locally. It uses synthetic identities and tokens and does not invoke Google or Expo. The worker returns aggregate run counts and duration without sending analytics events to a vendor.

### Account inbox and Android delivery

Apply the matching workspace and notification inbox migrations before enabling
the new client. Redeploy the circle worker with the inbox migration during the
same release. Keep the existing wake-up schedule for retries and delayed Expo
receipts. Verify the Android build has the intended Firebase configuration and
the corresponding Expo FCM v1 credential before exercising push.

On two Android devices with separate broker accounts, open Notifications and
confirm that the recipient device reports its permission, channel sound and
server registration. Send a test notification to this device, then send a new
invitation from the other account with the recipient app in the background.
Confirm the banner and sound and open the event from the app inbox. Repeat
with OS notifications disabled and verify that the app badge still increments
once. Open or accept the invitation and verify the badge clears.

Register a second device on the same recipient account and verify a new invite
creates one account event and separate delivery records for both registrations.
Verify a third account cannot read or mark another account's item. A push
ticket records Expo acceptance. A successful receipt records handoff to FCM.
Use a physical device to verify the banner and sound. For delivery diagnostics,
group by delivery status and failure reason. Keep push tokens, ticket IDs and
private broker or client data out of shared logs.

### EAS Update on Android Pilot

Before the first OTA-enabled APK, apply the pending Pilot migrations in order
and deploy the circle worker from the same revision. Build using EAS profile
`internal`, which embeds channel `viewstate-next-pilot` and the explicit Android
runtime in `artifacts/mobile/app.json`. Install the APK as an update over the
previous Pilot build using the same package and Android signing credential.

For compatible JS and bundled assets, run
`node scripts/publish-pilot-update.mjs "Release description"` from the repository
root after signing in to EAS and loading the existing worker secret from secure
operator storage. It publishes to the Pilot channel and queues one announcement
per published group for already registered devices with the matching runtime.
If Expo publication succeeds and the announcement fails, retry using
`--announce <published-group-id>` without republishing. When publishing directly
in EAS, the app can still detect the update and show the bell indicator, while the
operator needs the announcement command to send a push.

Verify the first release on an installed device with a distinct JS-only change.
Check the bell after foregrounding and via a push on a registered device. Use
Update app, confirm the restart, and verify the new content and a cleared badge.
Repeat with Android notifications disabled and verify the in-app update remains
available. For native changes, increment the explicit runtime and Android
versionCode and build another APK. Keep production builds on their own channel.
