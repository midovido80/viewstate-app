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
