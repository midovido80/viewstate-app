import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePilotSource,
  previewSourceConfig,
} from "../scripts/pilot-source.mjs";
import { fingerprintPreviewInputs } from "../scripts/preview-inputs.mjs";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

test("Pilot 2 is an explicit isolated preview target and cannot publish", () => {
  const experimental = { ...source, branch: "codex/pilot-2" };
  assert.doesNotThrow(() =>
    validatePilotSource(config, experimental, { preview: true, pilot2: true }),
  );
  assert.equal(
    previewSourceConfig(config, { preview: true, pilot2: true }).previewPort,
    8082,
  );
  assert.throws(
    () => validatePilotSource(config, experimental, { preview: true }),
    /PILOT_SOURCE_BRANCH/,
  );
  assert.throws(
    () => validatePilotSource(config, experimental),
    /PILOT_SOURCE_BRANCH/,
  );
  assert.throws(
    () => validatePilotSource(config, experimental, { pilot2: true }),
    /PILOT2_PREVIEW_ONLY/,
  );
  assert.throws(
    () =>
      validatePilotSource(
        config,
        { ...experimental, branch: "codex/p2-01-identity-auth" },
        { preview: true, pilot2: true },
      ),
    /PILOT_SOURCE_BRANCH/,
  );
  assert.doesNotThrow(() => validatePilotSource(config, source));
});

test("hosted migrations do not require ownership of managed Auth tables", async () => {
  const sql = await readFile(
    new URL(
      "../supabase/migrations/20261123130947_circle_invite_privacy_and_fairness.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(sql, /create\s+index[\s\S]*?on\s+auth\.users/i);
});

test("deferred publication keeps source gates and publishes without loading an announcement credential", () => {
  const publisher = new URL(
    "../scripts/publish-pilot-update.mjs",
    import.meta.url,
  ).href;
  const script = `
    import {registerHooks} from 'node:module';
    process.argv=['node','publisher','--defer-announcement','Verified release'];
    delete process.env.CIRCLE_WORKER_SECRET;
    globalThis.fetch=()=>{throw Error('Announcement must remain deferred')};
    const modules=new Map([
      ['./pilot-source.mjs',"export const assertPilotSource=()=>{console.log('SOURCE_GATE_CHECKED');return {branch:'codex/latest-pilot-2026-11-23',head:'a'.repeat(40),config:{channel:'viewstate-next-pilot',runtime:'viewstate-next-android-1'}}}"],
      ['node:child_process',"export const spawnSync=(cmd,args,options)=>{if(options.env.CIRCLE_WORKER_SECRET)throw Error('Credential reached bundle');console.log('PUBLISH_INVOKED');return {status:0,stdout:JSON.stringify([{platform:'android',runtimeVersion:'viewstate-next-android-1',group:'11111111-1111-4111-8111-111111111111'}])}}"]
    ]);
    registerHooks({resolve(name,ctx,next){return modules.has(name)?{url:'test-publish:'+name,shortCircuit:true}:next(name,ctx)},load(url,ctx,next){return url.startsWith('test-publish:')?{format:'module',source:modules.get(url.slice(13)),shortCircuit:true}:next(url,ctx)}});
    await import(${JSON.stringify(publisher)});
  `;
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { encoding: "utf8" },
  );
  assert.match(output, /SOURCE_GATE_CHECKED/);
  assert.match(output, /PUBLISH_INVOKED/);
  assert.match(output, /Announcement deferred/);
});
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

test("ignored Expo environment changes invalidate the web preview fingerprint", async () => {
  const prefix = path.join(tmpdir(), "viewstate-preview-inputs-");
  const root = await mkdtemp(prefix);
  try {
    await mkdir(path.join(root, "artifacts/mobile"), { recursive: true });
    const before = await fingerprintPreviewInputs(root, []);
    const env = path.join(root, "artifacts/mobile/.env.production.local");
    await writeFile(
      env,
      "EXPO_PUBLIC_VIEWSTATE_DOWNLOAD_URL=https://example.invalid/one\n",
    );
    const first = await fingerprintPreviewInputs(root, []);
    assert.notEqual(first, before);
    await writeFile(
      env,
      "EXPO_PUBLIC_VIEWSTATE_DOWNLOAD_URL=https://example.invalid/two\n",
    );
    assert.notEqual(await fingerprintPreviewInputs(root, []), first);
    await rm(env);
    assert.equal(await fingerprintPreviewInputs(root, []), before);
  } finally {
    assert.ok(root.startsWith(prefix));
    await rm(root, { recursive: true, force: true });
  }
});
