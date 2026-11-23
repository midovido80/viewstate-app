import { assertPilotSource } from "./pilot-source.mjs";
try {
  const source = assertPilotSource({
    preview: process.argv.includes("--preview"),
  });
  console.log(
    JSON.stringify({
      status: "verified",
      branch: source.branch,
      commit: source.head,
      dirty: source.dirty,
      mode: process.argv.includes("--preview")
        ? "working preview"
        : "published release",
    }),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
