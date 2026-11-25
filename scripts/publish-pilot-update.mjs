import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assertPilotSource } from "./pilot-source.mjs";

const mobile = new URL("../artifacts/mobile/", import.meta.url);
const { expo } = JSON.parse(
  await readFile(new URL("app.json", mobile), "utf8"),
);
const {
  build: { internal },
} = JSON.parse(await readFile(new URL("eas.json", mobile), "utf8"));
const endpoint =
  "https://taduvwcajtjpceavlxrc.supabase.co/functions/v1/circle-match-worker";
const groupPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const args = process.argv.slice(2);
const deferAnnouncement = args[0] === "--defer-announcement";
const [argument, existingGroup] = deferAnnouncement ? args.slice(1) : args;
const source = assertPilotSource();
console.log(`Publishing source: ${source.branch} at ${source.head}`);
const secret = process.env.CIRCLE_WORKER_SECRET;

if (!secret && !deferAnnouncement)
  throw new Error(
    "Load CIRCLE_WORKER_SECRET from secure operator storage before publishing.",
  );
if (deferAnnouncement && argument === "--announce")
  throw new Error("An announcement cannot also be deferred.");
if (
  internal.channel !== "viewstate-next-pilot" ||
  internal.channel !== source.config.channel ||
  expo.runtimeVersion !== source.config.runtime ||
  internal.environment !== "preview" ||
  expo.extra.eas.projectId !== "d6978e84-7f06-4074-a641-eef1f9b9021c" ||
  !/^viewstate-next-android-[0-9]{1,6}$/.test(expo.runtimeVersion)
) {
  throw new Error(
    "The Android Pilot configuration does not match this publishing command.",
  );
}

let group = existingGroup;
if (argument !== "--announce") {
  if (!argument?.trim())
    throw new Error(
      'Usage: node scripts/publish-pilot-update.mjs "Release description"',
    );
  // Leave the worker secret out of the update bundle process.
  const { CIRCLE_WORKER_SECRET: _, ...publishEnvironment } = process.env;
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  // Windows shells interpret metacharacters when invoking .cmd files.
  if (process.platform === "win32" && /[^a-zA-Z0-9 ._:+-]/.test(argument)) {
    throw new Error(
      "On Windows use letters, numbers, spaces and ._:+- in the release description.",
    );
  }
  const publish = spawnSync(
    npx,
    [
      "--yes",
      "eas-cli@27.9.0",
      "update",
      "--channel",
      internal.channel,
      "--environment",
      internal.environment,
      "--platform",
      "android",
      "--message",
      process.platform === "win32" ? `"${argument}"` : argument,
      "--json",
      "--non-interactive",
    ],
    {
      cwd: fileURLToPath(mobile),
      env: publishEnvironment,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
      shell: process.platform === "win32",
    },
  );
  if (publish.error || publish.status !== 0)
    throw new Error("EAS Update publication failed. Check the Expo output.");
  const updates = JSON.parse(publish.stdout);
  const published = updates.find(
    (update) =>
      update.platform === "android" &&
      update.runtimeVersion === expo.runtimeVersion,
  );
  group = published?.group;
  if (!groupPattern.test(group ?? "")) {
    throw new Error(
      "EAS publication returned an unexpected update group. Verify the Expo dashboard before retrying.",
    );
  }
  console.log(`Published Android Pilot update group: ${group}`);
}
if (!groupPattern.test(group ?? ""))
  throw new Error("Expected a published EAS update group UUID.");

if (deferAnnouncement) {
  console.log(`Announcement deferred. Published update group: ${group}`);
} else {
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        "x-viewstate-operation": "announce-update",
      },
      body: JSON.stringify({
        group,
        channel: internal.channel,
        runtime: expo.runtimeVersion,
      }),
    });
  } catch {
    throw new Error(
      `Update is published. Retry the announcement with --announce ${group}.`,
    );
  }
  if (!response.ok)
    throw new Error(
      `Update is published. Announcement returned HTTP ${response.status}. Retry with --announce ${group}.`,
    );
  const result = await response.json();
  console.log(
    `Update announcement accepted. New device deliveries queued: ${result.queued}.`,
  );
}
