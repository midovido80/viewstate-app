import { spawnSync, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertPilotSource, repositoryRoot } from "./pilot-source.mjs";
import { fingerprintPreviewInputs } from "./preview-inputs.mjs";

const pilot2 = process.argv.includes("--pilot2");
const previewOptions = { preview: true, pilot2 };
const before = assertPilotSource(previewOptions);
const mobile = path.join(repositoryRoot, "artifacts/mobile");
const output = path.join(
  repositoryRoot,
  pilot2 ? ".preview/pilot2-web" : ".preview/pilot-web",
);
async function fingerprint() {
  const names = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: repositoryRoot },
  )
    .toString()
    .split("\0")
    .filter(
      (name) =>
        name &&
        (name.startsWith("artifacts/mobile/") ||
          name.startsWith("lib/") ||
          ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"].includes(
            name,
          )),
    )
    .sort();
  return fingerprintPreviewInputs(repositoryRoot, names);
}
const inputHash = await fingerprint();
const { CIRCLE_WORKER_SECRET: _workerSecret, ...buildEnvironment } =
  process.env;
const build = spawnSync(
  process.execPath,
  [
    path.join(mobile, "node_modules/expo/bin/cli"),
    "export",
    "--platform",
    "web",
    "--output-dir",
    output,
  ],
  { cwd: mobile, stdio: "inherit", env: buildEnvironment },
);
if (build.error || build.status !== 0)
  throw Error("PILOT_PREVIEW_BUILD_FAILED");
const after = assertPilotSource(previewOptions);
if (before.head !== after.head || inputHash !== (await fingerprint()))
  throw Error("PILOT_PREVIEW_SOURCE_CHANGED: restart the preview build");
const proof = {
  branch: after.branch,
  commit: after.head,
  workingTree: after.dirty,
  sourceHash: inputHash,
  builtAt: new Date().toISOString(),
  root: repositoryRoot,
};
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "preview-source.json"),
  JSON.stringify(proof, null, 2),
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};
const handler = async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/__source") {
      const current = assertPilotSource(previewOptions);
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ...proof,
          currentCommit: current.head,
          stale: inputHash !== (await fingerprint()),
        }),
      );
      return;
    }
    let file = path.resolve(output, "." + decodeURIComponent(url.pathname));
    if (file !== output && !file.startsWith(output + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) file = path.join(output, "index.html");
    } catch {
      file = path.join(output, "index.html");
    }
    if (path.extname(file) === ".html") {
      assertPilotSource(previewOptions);
      if (inputHash !== (await fingerprint())) {
        res
          .writeHead(409)
          .end(
            "Preview source changed. Restart npm run preview:web to rebuild the current branch.",
          );
        return;
      }
    }
    res.setHeader(
      "Content-Type",
      types[path.extname(file)] || "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res
      .writeHead(503)
      .end(
        "Preview source is unavailable. Restart npm run preview:web from the designated branch.",
      );
  }
};
for (const address of ["127.0.0.1", "::1"]) {
  const server = createServer(handler);
  server.on("error", (error) => {
    console.error(`PILOT_PREVIEW_LISTEN_FAILED: ${error.code}`);
    process.exit(1);
  });
  server.listen(before.config.previewPort, address, () =>
    console.log(
      `Preview ${proof.branch} ${proof.commit.slice(0, 7)}: http://localhost:${before.config.previewPort}`,
    ),
  );
}
