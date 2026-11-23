# ViewState source and release rules

The active source is this repository on the branch declared in `pilot-source.json`: `codex/latest-pilot-2026-11-23`. This is also the GitHub default branch. Existing branches and Downloads snapshots are historical references, not release inputs.

- Start by reading `pilot-source.json`, `git status`, and the current branch. Do not substitute another checkout because its folder timestamp looks newer.
- Keep work on this designated branch unless the user explicitly requests another branch. Preserve existing edits and never force-push or delete historical branches without authorization.
- Run `npm run release:check` before publishing. Commit and push the intended source first; the release checker requires a clean checkout whose HEAD equals GitHub's branch tip.
- Publish Android updates through `npm run release:pilot -- "Release description"` or the Windows launcher in this repository. Do not publish directly from a backup folder or use a raw EAS command to bypass the source checks.
- Start web previews with `npm run preview:web`. It checks the branch and exports from this repository before serving localhost on both IPv4 and IPv6. Stop only a verified previous ViewState preview if port 8081 is occupied.
- Use `/__source` to verify the preview's built commit and source hash. A stale preview must be rebuilt; restarting a server against an old export is insufficient.
- For mobile code changes, run the full mobile test suite, mobile TypeScript, the affected domain checks, and appropriate browser/device verification before publication. Run `npm run test:release` when changing release tooling.
- The November 23 checksum manifest is a historical release snapshot. Do not rewrite it for later feature changes; create a new release record when needed.
- Keep Arabic RTL and Kuwaiti wording with standard Arabic spelling. Do not claim browser checks prove physical phone push delivery.
