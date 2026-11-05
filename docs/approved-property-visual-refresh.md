# Approved property visual refresh — 2026-11-05

Continues `fix/offline-session-sync-20261104` from `c5617c93ca97d50e6da4c1a5b9b7fb3276064fba`. The supplied property-list/detail videos and the three-page form mockup are the visual references.

## Result

- One persistent top toolbar places Settings and Notifications at fixed coordinates. Settings opens a local language sheet, retaining the mounted screen and form inputs. Existing account and notification pages remain reachable. Duplicate Home/tab toolbars are suppressed under the shared chrome. Capture uses card presentation so a native modal cannot cover this toolbar.
- Offered property cards show title, location, applicable facts, price/cadence and status beside the cover photo. Residential facts include rooms, bathrooms, area, parking and an explicitly present maid room. Commercial facts omit residential bedrooms and use area, bathrooms, automatic-number count and known parking. Explicit zero/false parking uses the existing car drawing with a slash; missing parking remains unknown. No counts are invented. Feet are converted once.
- Property details lead with gallery, title/location, a compact fact strip and price, followed by description, thumbnails and location. Other recorded facts/source controls remain accessible below. Edit is in the detail header. Contact/share are the footer actions; Contact is disabled when no linked source telephone exists.
- Full property details use three pages: specifications; services/nearby services; precise location/media/files and Save. Previous consumes one page before ordinary draft-safe Back applies. Controls stay mounted between pages, preserving pending numeric input, attachment state and callbacks. Existing basic capture-first and Wanted requirements paths retain their bounded behavior.
- Kitchen count offers only 0–3 with no manual override. Kitchens sit after bathroom count and retain separate layout/equipment/access. Layout adds Preparatory. New write builders enforce three; existing larger arrays remain readable and are not silently truncated. An unchanged older saved selection may be retained while editing unrelated facts.
- Existing map/crosshair/image/video/file drawings remain; button shape, dimensions and spacing are restyled. Numeric fields use compact label/control rows and retain manual entry where previously approved; services remain reversible chips. Shared palette uses background `#F5F5FB`, primary `#2854F4`, previous/action navy `#203568`.

## Data and compatibility

Optional public `listingTitle` and rental-only `rentalAvailability` metadata are validated and preserved through capture/edit/serialization. Untitled older records use the property type; they are not rewritten. Rented rental offers are excluded by domain matching eligibility, with the engine version advanced to invalidate old cached results. This does not exclude occupied sale investments or change scoring thresholds. Physical occupancy is not repurposed as offer availability. No backend schema, credentials or account settings are changed; sync transports the existing record JSON contract.

## Verification and remaining acceptance

The full local mobile selection passed: 979 tests, including nine new presentation/domain/persistence/search cases and a safe-area/keyboard/footer rendering case. Domain suites passed 29 tests. Mobile/domain typechecks and Android Metro export are checked separately; published GitHub Actions gates repeat on the final SHA. Typechecking and export are not visual or physical-device acceptance.

No Chrome/Chromium runtime is available here. Pixel-level comparison, real Android keyboard/gesture/safe-area checks, and save/reopen with selected media remain Preview/device acceptance checks. No APK/EAS build, Replit refresh, merge or production ref update is part of this package. Recovery branch preserves the exact pre-change commit.

Recovery: `recovery/before-property-visual-refresh-20261105` at `c5617c93ca97d50e6da4c1a5b9b7fb3276064fba`.
