import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export async function fingerprintPreviewInputs(root, names) {
  const inputs = new Set(names);
  for (const folder of ["", "artifacts/mobile/"])
    for (const name of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
      ".env.development",
      ".env.development.local",
    ])
      inputs.add(folder + name);
  const hash = createHash("sha256");
  for (const name of [...inputs].sort()) {
    hash.update(name + "\0");
    try {
      hash.update(await readFile(path.join(root, name)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update("deleted");
    }
  }
  return hash.digest("hex");
}
