# ViewState source and release rules

The active source is this repository on the branch declared in `pilot-source.json`: `codex/latest-pilot-2026-11-23`. This is also the GitHub default branch. Existing branches and Downloads snapshots are historical references, not release inputs.

## Pilot 2 development exception

The user approved a staged visual redesign on November 26. Its integration branch is `codex/pilot-2`, based on `a6dc3f228edc2c2ccf15966aa7d84df3c50851f4`. Feature branches `codex/p2-*` target this integration branch through PRs and passing checks. This exception permits development and local previews, not Android publication or a default-branch change. Return the local checkout to the designated release branch after the verification session. Use `npm run preview:pilot2` only on `codex/pilot-2`; it builds a separate export on port 8082 with `/__source` proof. The normal preview and release commands retain their existing source gates.

Property and person-requirement fields, validation, persistence and the offered/required → sale/rent → residential/commercial → subtype journey remain unchanged. Land is excluded. Each later form change requires its own agreed scope. Stage checkpoints are candidates until the user accepts the visual result; never label them approved automatically.

- Start by reading `pilot-source.json`, `git status`, and the current branch. Do not substitute another checkout because its folder timestamp looks newer.
- Use this designated branch as the base for ongoing work. Its GitHub rules require pull requests and passing checks: use a short-lived `codex/` topic branch for a change, merge it into the designated branch, then return the local checkout to that branch. Publication and final previews use the designated branch. Preserve existing edits and never force-push or delete historical branches without authorization.
- Run `npm run release:check` before publishing. Commit and push the intended source first; the release checker requires a clean checkout whose HEAD equals GitHub's branch tip.
- Publish Android updates through `npm run release:pilot -- "Release description"` or the Windows launcher in this repository. Do not publish directly from a backup folder or use a raw EAS command to bypass the source checks.
- Start web previews with `npm run preview:web`. It checks the branch and exports from this repository before serving localhost on both IPv4 and IPv6. Stop only a verified previous ViewState preview if port 8081 is occupied.
- Use `/__source` to verify the preview's built commit and source hash. A stale preview must be rebuilt; restarting a server against an old export is insufficient.
- For mobile code changes, run the full mobile test suite, mobile TypeScript, the affected domain checks, and appropriate browser/device verification before publication. Run `npm run test:release` when changing release tooling.
- The November 23 checksum manifest is a historical release snapshot. Do not rewrite it for later feature changes; create a new release record when needed.
- Keep Arabic RTL and Kuwaiti wording with standard Arabic spelling. Do not claim browser checks prove physical phone push delivery.
