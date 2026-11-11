# Trust circle Android acceptance

The pilot handles explicitly shared KWD apartment rentals and requests. Request publication shares areas, maximum rent, rental period, bedrooms and bathrooms. Re-publish to update those request facts. The private workspace sync also withdraws shared requests when a synchronized original is deleted. Shared listing availability and deletion follow the lifecycle migration from PR #58. Publish again to update other listing facts.

## Test environment

1. Use a Supabase test environment with the circle inventory, lifecycle and matching delivery migrations applied in order. Apply the migrations before using the circle screens.
2. Deploy `circle-match-worker` from this repository with the shared TypeScript domain modules included. Its custom bearer check requires gateway JWT verification to be disabled for this function. Set a randomly generated `CIRCLE_WORKER_SECRET` in Edge Functions secrets. The worker uses the project's server-side service role. If enhanced Expo push security is enabled, set `EXPO_ACCESS_TOKEN` in the same server secret store.
3. Configure a database webhook on inserts into `viewstate_circle.change_queue` to POST to the worker. Use the worker secret as its Authorization bearer through the environment's secret store. Configure a periodic retry invocation for pending deliveries and failed webhook runs. The worker reads queued revisions and does not recalculate idle circles.
4. Supply the Android Firebase configuration as the `GOOGLE_SERVICES_JSON` file environment variable for the internal build and configure the corresponding FCM credentials in Expo. Use the existing app identity and Google OAuth callback for the test build. Install the internal APK on three Android devices or supported Android environments with Google Play Services and three distinct Google test accounts.

## Device journey

- In Matching, open Trust circle matching and enable notifications on A and B. A creates a circle and invites B by the account ID shown in the app. C has no membership. B accepts and C declines a later invitation. Verify C cannot read the catalog through the authenticated API, including with the circle ID.
- B chooses a saved apartment rental request and shares it for automatic matching. A chooses and publishes a compatible listing. Verify B can run Match now in circle and that A and B can refresh the server results. Verify C has neither access nor an outbox entry.
- Confirm actual push arrival on Android with the app in foreground, background and normally closed. Record device receipt timestamps separately from Expo ticket acceptance. Repeat the webhook and verify there are no duplicate outbox records.
- Take A offline. Change the listing to rented, then reconnect. Verify the stale match disappears from the shared results after sync. Repeat with deletion and a stale publish retry. A later retry must not resurrect the deleted listing.
- Record times for publish, first visible server result, and first visible phone notification. Use synthetic listings and avoid exporting contact details or tokens with evidence.

The PostgreSQL harness runs the real migrations, matching engine, role checks and outbox transitions locally. It uses synthetic identities and tokens and does not invoke Google or Expo. The worker returns aggregate run counts and duration without sending analytics events to a vendor.
