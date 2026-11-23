# Offline account continuity and private workspace sync

Baseline: `23ad1f5db6c147bfb875da34ac406f424d0a0a9e` (approved mobile UX).
Branch: `fix/offline-session-sync-20261104`. Main/pilot and the UX work branch are not moved.

## Account continuity

Access-token expiry no longer revokes a local account scope. A timeout, missing network or temporary Auth server error does not unmount the route or discard its in-memory editor. Resume triggers auto-refresh and revalidation. Explicit sign-out, a different account or a confirmed terminal Auth rejection still closes that account's scope; account data are retained in its own namespace.

After an online Google verification and completed contact profile, a project-specific receipt is saved in native SecureStore using the existing chunked sensitive-storage adapter. Web uses the existing sessionStorage security boundary. Cold offline startup uses this receipt only if the SDK's stored session owner and the last observed Auth identity match it. A callback/new Google identity bypasses an old receipt. The receipt grants local access only: every cloud run is revalidated, every HTTP request captures an owner-checked JWT and Postgres/Storage enforce ownership independently.

An existing installation needs one successful online opening after the update to establish its receipt. New Google sign-in still needs a connection. Guest mode remains local until the existing explicit activation/import flow. Unsaved in-memory form state survives background/foreground transitions; durable draft coverage remains the existing per-form coverage. Android process termination cannot preserve arbitrary unsaved React state.

Contact-profile edits are saved locally and queued for later private `user_profiles` upsert. A late acknowledgement cannot overwrite a newer local edit or recreate a forgotten receipt.

## Workspace coverage

Properties (including all canonical details, private notes and location), people, requirements, person/property links, property sources, follow-up tasks, availability/contact outcomes and dismissed follow-up suggestions synchronize inside the signed-in account. Local repositories remain the primary write path. Local data plus the last acknowledged base form the durable pending queue; no network request is needed to save business changes.

Capture/edit recovery journals, drafts, device preferences, notification history and guest originals stay local. They are not copied blindly between devices. Property image/video/PDF bytes synchronize through a private, immutable content-addressed Storage bucket. Device paths never become cloud media references. Downloads are hash-verified before local managed URIs are installed. The bucket's per-object limit is 50 MiB; oversized/missing/unreadable files keep sync pending without removing local records or files.

Application writers and sync apply use a shared per-account coordinator. SQLite applies the business snapshot in an actual database transaction; web arrays use a durable before/after recovery journal. A separate apply journal recovers a crash between business replacement and assistant-state installation. Expected snapshots prevent a concurrent edit from being silently overwritten. A pulled merge notifies focused list/Home routes without remounting editor components. Unchanged cloud acknowledgements do not rewrite assistant revisions or clear Undo.

Sync runs on activation, relevant local writes, web online events, and foreground retries every 30 seconds. It is not an Android foreground service or a promise of continuous execution after the OS suspends/kills the app.

## Conflicts and server storage

Three-way merge compares base/local/cloud per record. Independent changes merge; same-record edits and delete-versus-edit conflicts preserve both sides. Nothing conflicting is published or applied until an explicit resolution. Resolution is rejected if either side changed since review. Merged data and relationships are validated before publication. The non-blocking conflict sheet offers device/cloud versions and exact details; ordinary local work remains available.

Supabase project: `taduvwcajtjpceavlxrc` (`viewstate-app-pilot`), matching the application's documented personal Auth endpoint. Additive migrations applied:

- `20261104070955_offline_workspace_sync.sql`
- `20261104071244_fix_sync_record_key_validation.sql`

The current workspace has an owner UUID, revision and private payload (16 MiB metadata limit; exceeding it leaves local data intact and sync pending). `commit_account_workspace` derives the owner from `auth.uid()`; there is no editable owner parameter. Compare-and-swap prevents lost updates. Immutable history stores changed records and deletion keys rather than duplicating the entire workspace on each revision. Direct client INSERT/UPDATE/DELETE is denied. RLS protects current/history reads and owner-prefixed media; media cannot be overwritten or publicly read. No existing business data or auth settings were deleted/changed, and no paid plan/project/branch was created.

The database advisor flags the authenticated SECURITY DEFINER RPC. This is intentional: the function needs exclusive write authority while clients have only SELECT. It has an empty search_path, checks authentication/anonymous status, derives the owner server-side and never accepts SQL or an owner argument. Anonymous EXECUTE is revoked. The pre-existing leaked-password-protection warning is unchanged.

## Validation and release boundaries

Automated cases cover expired-token/offline resume, temporary refresh errors, owner changes, trusted-receipt ownership, explicit sign-out, pending-profile races, offline edits/restarts/retries, cloud CAS races, duplicate retries, explicit/stale conflict resolution, foreign references, real WebStore rollback, actual in-memory SQLite transaction rollback, media normalization/hash mismatch and scope revocation during network flight.

`supabase/tests/offline_workspace_sync.sql` ran against the actual project, including CAS/history, denied direct/anonymous writes and a different identity's RLS reads. All fixtures were rolled back. SQL tests are not evidence of a physical Android/SecureStore/Google round-trip or a live authenticated binary upload from the app. These require the updated APK and device review. No EAS build, Replit update, deployment of application code or pilot merge is included.

The existing web Expo export `.wasm` resolver issue is outside this change. Android export checks bundling; it does not test airplane mode, a prolonged call or Android process death on hardware.

Rollback: run the previous app revision if needed; preserve the new private server tables/bucket/history and local journals. Do not drop synchronized data as an application rollback step.
