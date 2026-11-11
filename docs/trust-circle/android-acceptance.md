# Trust circle Android acceptance

The circle handles explicit sale and rental shares for the property types supported by the existing forms. Review the request and listing projections before publishing. The private workspace sync withdraws shared records when a synchronized original is deleted. Use a representative residential and commercial case for each transaction before the scale run.

## Test environment

1. Use a Supabase test environment with the circle inventory, lifecycle, matching delivery, expanded types, listing management and cooperation migrations applied in order. Apply the migrations before using the circle screens.
2. Bundle `supabase/functions/circle-match-worker/index.ts` into a single ESM file before deployment so the same TypeScript domain engine ships with the worker. From the workspace, use the esbuild executable from the pinned pnpm dependency tree with `--bundle --platform=neutral --format=esm`. Deploy the bundled file as `index.ts` under `circle-match-worker`. Its custom bearer check requires gateway JWT verification to be disabled for this function. Set a randomly generated `CIRCLE_WORKER_SECRET` in Edge Functions secrets. The worker uses the project's server-side service role. If enhanced Expo push security is enabled, set `EXPO_ACCESS_TOKEN` in the same server secret store.
3. Store the full Pilot worker HTTPS URL as `circle_worker_url` in Supabase Vault. Store the same dedicated bearer configured in step 2 as `circle_worker_secret`. Run `scripts/enable-circle-worker-delivery.sql` as the database operator. The script wires a private database webhook and a one-minute retry job. Use a project-specific URL and secret. Check `cron.job_run_details`, worker aggregate results and the outbox without printing request headers or device tokens.
4. Supply the Android Firebase configuration as the `GOOGLE_SERVICES_JSON` file environment variable for the internal build and configure the corresponding FCM credentials in Expo. Use the existing app identity and Google OAuth callback for the test build. Install the internal APK on three Android devices or supported Android environments with Google Play Services and three distinct Google test accounts.

## Device journey

- In Matching, open Trust circle matching and enable notifications on A and B. A creates a circle and invites B by the account ID shown in the app. C has no membership. B accepts and C declines a later invitation. Verify C cannot read the catalog through the authenticated API, including with the circle ID.
- B chooses a saved request and shares it for automatic matching. A chooses and publishes a compatible listing. Verify B can run Match now in circle and that A and B can refresh the server results. Verify C has neither access nor an outbox entry. Send and respond to a cooperation request. Verify that its notification opens the Trust Circle surface while signed into an authorized account.
- Confirm actual push arrival on Android with the app in foreground, background and normally closed. Record device receipt timestamps separately from Expo ticket acceptance. Repeat the webhook and verify there are no duplicate outbox records. A transport timeout after provider acceptance is ambiguous and can cause a duplicate delivery on retry.
- Take A offline. Change the listing to rented, then reconnect. Verify the stale match disappears from the shared results after sync. Repeat with deletion and a stale publish retry. A later retry must not resurrect the deleted listing.
- Confirm a cooperation completion from both accounts and verify the owner’s final status is reflected in the shared listing. Repeat with a declined request and a closed collaboration.
- Record times for publish, first visible server result, and first visible phone notification. Use synthetic listings and avoid exporting contact details or tokens with evidence.

The PostgreSQL harness runs the real migrations, matching engine, role checks and outbox transitions locally. It uses synthetic identities and tokens and does not invoke Google or Expo. The worker returns aggregate run counts and duration without sending analytics events to a vendor.
