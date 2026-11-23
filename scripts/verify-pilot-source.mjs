import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  await readFile(
    path.join(root, "docs/releases/pilot-source-20261123.json"),
    "utf8",
  ),
);
const mismatches = [];
for (const file of manifest.files) {
  const target = path.resolve(root, file.path);
  if (!target.startsWith(root)) throw Error("SOURCE_PATH_OUTSIDE_REPOSITORY");
  try {
    let bytes = await readFile(target);
    if (!bytes.includes(0)) {
      try {
        bytes = Buffer.from(
          new TextDecoder("utf-8", { fatal: true })
            .decode(bytes)
            .replace(/\r\n/g, "\n"),
        );
      } catch {}
    }
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      mismatches.push(file.path);
  } catch {
    mismatches.push(file.path);
  }
}
if (mismatches.length) {
  console.error(
    JSON.stringify({ status: "mismatch", files: mismatches }, null, 2),
  );
  process.exitCode = 1;
} else
  console.log(
    JSON.stringify({
      status: "verified",
      files: manifest.files.length,
      otaGroup: manifest.otaGroup,
      androidUpdateId: manifest.androidUpdateId,
    }),
  );
