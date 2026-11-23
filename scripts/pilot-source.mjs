import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
export const pilotConfig = JSON.parse(
  readFileSync(new URL("../pilot-source.json", import.meta.url), "utf8"),
);
export function validatePilotSource(config, source, { preview = false } = {}) {
  if (source.branch !== config.branch)
    throw Error(
      `PILOT_SOURCE_BRANCH: use ${config.branch}; current checkout is ${source.branch || "detached"}`,
    );
  const remote = source.remote
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  if (remote.toLowerCase() !== config.repository.toLowerCase())
    throw Error(
      "PILOT_SOURCE_REPOSITORY: origin does not match pilot-source.json",
    );
  if (!preview && source.dirty)
    throw Error(
      "PILOT_SOURCE_DIRTY: commit and push your changes before publishing",
    );
  if (!preview && source.remoteHead !== source.head)
    throw Error(
      "PILOT_SOURCE_REMOTE_MISMATCH: local HEAD must equal the published GitHub branch tip",
    );
  if (!preview && source.defaultBranch !== config.branch)
    throw Error(
      "PILOT_SOURCE_DEFAULT_BRANCH: GitHub default branch must match pilot-source.json",
    );
}
export function assertPilotSource({ preview = false } = {}) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const root = git(["rev-parse", "--show-toplevel"]);
  if (path.resolve(root) !== path.resolve(repositoryRoot))
    throw Error("PILOT_SOURCE_ROOT: run from the canonical repository");
  const source = {
    branch: git(["branch", "--show-current"]),
    remote: git(["remote", "get-url", "origin"]),
    head: git(["rev-parse", "HEAD"]),
    dirty: Boolean(git(["status", "--porcelain"])),
    remoteHead: "",
    defaultBranch: "",
  };
  validatePilotSource(
    pilotConfig,
    { ...source, remoteHead: source.head, defaultBranch: pilotConfig.branch },
    { preview },
  );
  if (!preview) {
    const remoteLines = git([
      "ls-remote",
      "--symref",
      "--exit-code",
      "origin",
      "HEAD",
      `refs/heads/${pilotConfig.branch}`,
    ]).split(/\r?\n/);
    source.remoteHead =
      remoteLines
        .find((line) => line.endsWith(`\trefs/heads/${pilotConfig.branch}`))
        ?.split(/\s/)[0] ?? "";
    source.defaultBranch =
      remoteLines
        .find(
          (line) =>
            line.startsWith("ref: refs/heads/") && line.endsWith("\tHEAD"),
        )
        ?.slice("ref: refs/heads/".length)
        .split(/\s/)[0] ?? "";
    validatePilotSource(pilotConfig, source);
  }
  return { ...source, root, config: pilotConfig };
}
