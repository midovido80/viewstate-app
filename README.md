# ViewState

The active development and release branch is **`codex/latest-pilot-2026-11-23`**, the GitHub default branch. [Open the current source](https://github.com/midovido80/viewstate-app/tree/codex/latest-pilot-2026-11-23).

`pilot-source.json` declares the repository, branch, Android OTA channel/runtime and local preview port. Historical Downloads copies and backup branches are not release sources.

From this repository root:

```sh
npm run test:release
npm run release:check
npm run preview:web
```

The web preview rebuilds from this repository, then serves [localhost:8081](http://localhost:8081). [Preview source information](http://localhost:8081/__source) records the built branch, commit, source hash and whether edits were included. If app source changes, restart the preview command to rebuild it.

Commit and push the intended changes before running `npm run release:pilot -- "Release description"`. The release check refuses a different branch/repository, uncommitted files, an unpublished or obsolete commit, or a different GitHub default branch. The existing worker secret must be loaded from secure operator storage for release announcements.

See [the source and release policy](docs/releases/pilot-source-policy-20261123.ar.md), [the November 23 source recovery report](docs/releases/github-recovery-20261123.ar.md), and [project instructions](AGENTS.md). Web previews do not prove physical Android push delivery.

The [Claude report remediation results](docs/releases/claude-report-fixes-20261123.ar.md) record source fixes, regression checks, pending deployment and remaining product/device decisions.

The [multi-recipient invitation change](docs/viewstate-next/multi-recipient-invitations-20261124.ar.md) adds phone/saved-person selection, private batch invitations and individual WhatsApp drafts. It remains a source change awaiting separate deployment.

Pilot 2 is a separate, unpublished visual redesign on `codex/pilot-2`. Feature PRs target that integration branch. Run `npm run preview:pilot2` there for a rebuilt local preview on port 8082, and verify `/__source`. This does not change the release branch, OTA channel, native app identity or hosted database. See [the staged redesign contract](docs/viewstate-next/pilot2-stage1-20261126.ar.md).
