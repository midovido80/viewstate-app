# ViewState Next — isolated native migration

Status: first foundation package, **not complete demo parity**.

## Approved boundary

- Repository: `midovido80/viewstate-app`.
- Work branch: `work/viewstate-next-20261107`.
- Exact baseline: `aaaab922ecae8ed4eb0bece2d3c3e29bea35b46f`.
- Reference: https://viewstate-new-experience.tomylomy123.chatgpt.site
- Build the demo experience on top of the original Expo application. Retain the original property form catalogs, conditional fields, validators, subtype routes, minimum semantics, draft recovery, media ownership and storage adapters.
- Do not import the demo's sample records or simplified matching engine into the real application.
- Preserve production/account data. The separate Replit clone does not isolate Supabase data automatically. Test in a dedicated guest/test workspace with fictional records.
- Main, pilot, existing Replit, Supabase, Google settings, EAS project, package identifiers and signing are outside this work package. The founder postponed separate package/Google setup and APK creation until final visual/functional acceptance.

## First package implemented

| Surface                 | Change                                                                                                                  | Original behavior retained                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global chrome           | Approved blue, white mark, quiet tools and search on each mounted screen                                                | Existing global search, local language sheet, notification/account routes; language change keeps the editor mounted                                 |
| Home                    | Task-first offer/request entry, saved offers, top matching opportunities, three follow-ups and one lower calendar entry | Actual account catalog, existing saved matching, scoped links, task editor/history/outcomes/calendar and retry/undo                                 |
| Navigation              | Quiet flat tabs, blue selected state, raised blue/white plus                                                            | Existing tab events, params, hidden More route and original quick-add petals/actions                                                                |
| Property cards          | Large saved cover, title/location, price and facts, direct scoped matching                                              | Managed media access, explicit missing/zero facts, original source links and property detail routes                                                 |
| Detail specifications   | Three-column calm fact grid and neutral supplementary cells                                                             | Existing field projection, explicit parking states and every recorded fact                                                                          |
| Forms                   | Roomier grouped cards and compact numeric grids, one-tap single selection                                               | Exact original options/callbacks, unspecified/manual values, service toggle chips, multi-select confirmation, validation, drafts and save contracts |
| Web export prerequisite | Register SQLite `.wasm` assets with Metro                                                                               | Existing web/native storage choice; no fallback bypass of secure browser locks                                                                      |

Home says **saved offers**, rather than claiming an interaction history that is not yet tracked. Its matching count is the current existing top-five shortlist, not an invented total count. Pending follow-ups are shown in original date/time order, including overdue items with their dates; there is no nested scroll to trap the page.

## Remaining migration / acceptance

This commit is a reviewable beginning, not a final replacement build:

1. Compare each original residential/commercial property and client requirement form against the reference; finish row grouping, kitchen/bathroom placement and newly approved applicability without removing legacy read compatibility.
2. Align all person/request detail, matching explanations/actions, share preview, settings/notification and calendar surfaces with the reference while retaining their real commands and permissions.
3. Implement the approved paste-and-review flow using the original capture contracts; no fake import action or alternate storage engine.
4. Add the short first-use guidance and recently-worked-on behavior with account-scoped state.
5. Exercise complete fictional offer → client request → scoped comparison → privacy preview → follow-up → edit/reload journeys in secure Replit Preview, AR and EN, small/large text and Android Back.
6. Founder acceptance, final functional review, then separately authorize package identity/Google setup and APK build.

No claim of device acceptance or complete visual parity is made for this first package. The native app's existing broader form matrix is authoritative over the simplified demo forms.

## Verification

- Mobile selection: **981 passing, 0 failing**, including original form/matching/persistence suites and a new numeric picker interaction test (single selection closes; multi-selection remains open; AR/EN).
- Domain matching: **29 passing**, domain contract script passed.
- Mobile typecheck and standalone domain typecheck passed.
- Expo web export and Android Metro/Hermes bundle export passed. These are JavaScript bundle checks, not an APK build. The retained local dependency tree needed `NODE_PATH` pointing at its existing pnpm hoisted modules for Babel; no dependency or lockfile was changed.
- Local browser reached the real guest entry but could not open guest storage in the managed HTTP preview. Existing account adapters require secure browser locks; no insecure fallback or authentication change was introduced. Full screen-by-screen browser acceptance remains for the new secure Replit Preview.
- CI runs on `work/viewstate-next-*` using the existing critical/advisory jobs. Verify the actual final SHA's run before acceptance.

The Metro asset setup follows Expo's SDK 54 SQLite web instructions: https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/#web-setup
