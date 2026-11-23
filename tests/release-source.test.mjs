import test from "node:test";
import assert from "node:assert/strict";
import { validatePilotSource } from "../scripts/pilot-source.mjs";

const config = {
  repository: "midovido80/viewstate-app",
  branch: "codex/latest-pilot-2026-11-23",
};
const source = {
  branch: config.branch,
  remote: "https://github.com/midovido80/viewstate-app.git",
  head: "a".repeat(40),
  remoteHead: "a".repeat(40),
  defaultBranch: config.branch,
  dirty: false,
};
test("publishing accepts the committed current tip of the designated branch", () => {
  assert.doesNotThrow(() => validatePilotSource(config, source));
});
test("publishing refuses an old branch, detached checkout or another repository", () => {
  for (const branch of ["main", "backup/local-changes-2026-11-23", ""])
    assert.throws(
      () => validatePilotSource(config, { ...source, branch }),
      /PILOT_SOURCE_BRANCH/,
    );
  assert.throws(
    () =>
      validatePilotSource(config, {
        ...source,
        remote: "https://github.com/another/project.git",
      }),
    /PILOT_SOURCE_REPOSITORY/,
  );
});
test("publishing refuses uncommitted files and an unpublished or obsolete commit", () => {
  assert.throws(
    () => validatePilotSource(config, { ...source, dirty: true }),
    /PILOT_SOURCE_DIRTY/,
  );
  assert.throws(
    () =>
      validatePilotSource(config, { ...source, remoteHead: "b".repeat(40) }),
    /PILOT_SOURCE_REMOTE_MISMATCH/,
  );
  assert.throws(
    () => validatePilotSource(config, { ...source, remoteHead: "" }),
    /PILOT_SOURCE_REMOTE_MISMATCH/,
  );
});
test("a working preview allows edits only on the designated source branch", () => {
  assert.doesNotThrow(() =>
    validatePilotSource(
      config,
      { ...source, dirty: true, remoteHead: "" },
      { preview: true },
    ),
  );
  assert.throws(
    () =>
      validatePilotSource(
        config,
        { ...source, branch: "main", dirty: true },
        { preview: true },
      ),
    /PILOT_SOURCE_BRANCH/,
  );
});
test("SSH remotes for the same repository are accepted", () => {
  assert.doesNotThrow(() =>
    validatePilotSource(config, {
      ...source,
      remote: "git@github.com:midovido80/viewstate-app.git",
    }),
  );
});

test("publishing refuses a repository whose default branch no longer matches the release policy", () => {
  assert.throws(
    () => validatePilotSource(config, { ...source, defaultBranch: "main" }),
    /PILOT_SOURCE_DEFAULT_BRANCH/,
  );
});
