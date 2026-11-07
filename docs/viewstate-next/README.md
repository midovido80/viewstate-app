# ViewState Next — isolated native migration

Status: native foundation, workflow/presentation updates and approved private message import. **Full visual parity and device acceptance remain unverified.**

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

Home now distinguishes actual **recently worked on** records from its **saved offers** fallback. Recent work stores only record kind, ID and visit time, resolves against the active account catalog, omits removed records, and retains at most 12 entries. First-use acknowledgement and recent-work writes are serialized and confirmed by readback; corrupt state is retained with a retry state. Its matching count is the current existing top-five shortlist, not an invented total count. Pending follow-ups are shown in original date/time order, including overdue items with their dates; there is no nested scroll to trap the page.

## Second package implemented

| Surface                | Native implementation                                                                                                         | Retained behavior                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First use and help     | Dismissible introduction, four-step guide, guide available from global settings                                               | No forced route replacement or sample-data injection; acknowledgement is local to the active workspace                                                                        |
| Recent work            | Actual property/person/request visits, full history page, honest saved-offer fallback                                         | Active account catalog and managed cover access; loading, empty, error and retry states                                                                                       |
| Message import | Selected Android shares, paste/media intake, local suggestions, review and original-form handoff | Private originals, explicit confirmation, account-scoped durable inbox, no overwrite of an existing capture; native receiving/OCR need a new APK |
| Property details       | Price before facts, compact service/nearby chips, correct source heading, follow-up entry                                     | Every original fact, gallery/file access, maps, source management, scoped matching and edit routes                                                                            |
| People and requests    | Requests before linked offers, quieter profile, compact request detail chips, direct person follow-up                         | Original person roles, ownership, linking/unlinking, phone LTR, request edit and matching                                                                                     |
| Matching               | Quieter cards plus real property-share and linked follow-up actions                                                           | Original scores, unknowns, differences, full comparison, original saved-record scope and Match all                                                                            |
| Sharing                | Approved-content preview before controls; explicit selected recipient loaded from the current account                         | Original privacy allowlists, opt-in source/location/contacts, attachment selection and actual system share. Opening share is not delivery                                     |
| Forms                  | Bathroom/kitchen count pairing, labels above numeric controls, two-column kitchen details, large-text stacking                | Original control owners and validation; numeric/manual semantics, per-kitchen values, original Studio form                                                                    |
| Kitchen applicability  | House/villa/chalet/duplex, office/commercial floor controls                                                                   | Legacy apartment/shop/residential-floor kitchen values still round-trip without deletion; no domain migration                                                                 |
| Settings/notifications | Shared calm header, one title, consistent content width; local language sheet retained                                        | Existing account, notification, backup, restore and privacy commands                                                                                                          |
| Contact import         | Home import opens the existing person/import entry, explains role selection, shows classification errors in either entry mode | Actual contacts permission and reviewed batch workflow; browser unavailability remains explicit                                                                               |

The approved message-import package now extends this entry to selected Android shares, offline text extraction/review and original Studio/property/client-request form handoff. See [import-20261107.md](import-20261107.md) for the exact scope, privacy boundaries, checks and device gaps. This does not implement a WhatsApp Business Platform bot or whole-chat import. Native receiving and image OCR require a new APK and device acceptance.

Direct follow-up entry validates each supplied person/property against the current catalog. Person-only and property-only entries open the original editor; entries linked to a particular record use a separate draft scope rather than restoring an unrelated generic follow-up draft.

## Property form follow-up

The reference-alignment and save-feedback package is documented in [forms-review-20261107.md](forms-review-20261107.md): two-column original fields, compact housing selection, field-specific save feedback, and type-based Home headings. It includes a browser component screenshot and original storage save/reopen regression tests.

## Verification and remaining acceptance

- Mobile TypeScript and property-domain TypeScript checks; complete mobile test suite and domain matching suite.
- New tests cover real route history, bounded/deduplicated recent work, corrupt/future state retention, concurrent repository writes, unconfirmed-save retry, capture overwrite prevention, private-message exclusion from the original share preview, approved kitchen visibility and legacy round-trips, kitchen count/detail separation, and real matching callbacks in AR/EN.
- Expo web and Android JavaScript/Hermes exports. An Android bundle export is **not** an APK or a device test.
- The managed local HTTP Preview loads the login/guest screen, but guest workspace setup fails with “Could not open guest storage. Data is preserved; retry.” No auth/storage safeguards were weakened. Therefore the new authenticated/guest application screens have **not** passed an end-to-end browser or screenshot acceptance in this environment.

Still required:

1. Secure Replit Preview or device QA: fictional offer → request → scoped comparison → selected-content share preview → follow-up → edit/reload, AR/EN, long values, keyboard and large text.
2. Complete the remaining message-intake parity described above and compare every residential/commercial form against the original catalog and approved reference. In particular, do not infer “shared bathroom” from a false private-bathroom boolean; an explicit new field needs its own persistence contract.
3. Review all final page spacing, calendar/notification surfaces and navigation against the approved reference. Existing native routes and actions are retained; this package is not evidence of pixel-identical parity.
4. Android system Back, background/resume and authenticated offline/reconnect sync tests.
5. Founder acceptance, then separately authorize package identity/Google setup and APK creation.

Main/pilot, account/backend configuration, EAS identity/signing and deployment remain outside this work package.
