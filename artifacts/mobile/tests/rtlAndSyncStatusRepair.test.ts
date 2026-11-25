import test from "node:test";
import assert from "node:assert/strict";
import { textDirectionStyle } from "../services/textDirection";
import {
  workspaceSyncProblem,
  workspaceSyncProblemMessage,
} from "../services/workspaceSyncStatus";
import { readFile, readdir } from "node:fs/promises";
import { URL } from "node:url";
import { registerHooks } from "node:module";

test("Arabic Android text uses physical right alignment without inheriting the RTL paragraph reversal", () => {
  const ar = textDirectionStyle(true, "android");
  assert.deepEqual(ar, {
    textAlign: "right",
    writingDirection: "rtl",
    direction: "ltr",
  });
  assert.equal(textDirectionStyle(true, "web").direction, "rtl");
  assert.equal(textDirectionStyle(false, "android").textAlign, "left");
  assert.equal(textDirectionStyle(false, "ios").writingDirection, "ltr");
});

test("all application Text imports pass through the shared direction boundary", async () => {
  const files: string[] = [];
  async function walk(url: URL) {
    for (const entry of await readdir(url, { withFileTypes: true })) {
      const item = new URL(entry.name + (entry.isDirectory() ? "/" : ""), url);
      if (entry.isDirectory()) await walk(item);
      else if (entry.name.endsWith(".tsx") && entry.name !== "AppText.tsx") {
        const source = await readFile(item, "utf8");
        const imports = [
          ...source.matchAll(
            /import\s*\{([^}]*)\}\s*from\s*["']react-native["']/g,
          ),
        ];
        assert.equal(
          imports.some((match) =>
            match[1]
              .split(",")
              .some((spec) => /^Text(?:\s|$)/.test(spec.trim())),
          ),
          false,
          item.pathname,
        );
        files.push(item.pathname);
      }
    }
  }
  for (const dir of ["app", "components", "contexts"])
    await walk(new URL(`../${dir}/`, import.meta.url));
  assert.ok(files.length > 100);
});

test("sync status distinguishes background edits, missing attachments and connection failure without exposing raw error data", () => {
  assert.equal(workspaceSyncProblem(Error("SYNC_LOCAL_CHANGED")), "pending");
  assert.equal(
    workspaceSyncProblem(Error("SYNC_RETRY_AFTER_CONCURRENT_EDIT")),
    "pending",
  );
  assert.equal(
    workspaceSyncProblem(Error("SYNC_MEDIA_MISSING")),
    "missing_media",
  );
  assert.equal(
    workspaceSyncProblem(Error("MEDIA_OWNER_MISMATCH")),
    "media_access",
  );
  assert.equal(workspaceSyncProblem(Error("SYNC_HTTP_401")), "offline");
  assert.equal(
    workspaceSyncProblem(Error("SYNC_STATE_DAMAGED")),
    "damaged_state",
  );
  const privateError = "private@example.test";
  assert.equal(workspaceSyncProblem(Error(privateError)), "unknown");
  const message = workspaceSyncProblemMessage("unknown", true);
  assert.match(message, /نسخة حسابك الخاصة/);
  assert.equal(message.includes(privateError), false);
});

test("the real text wrapper preserves center alignment, explicit phone direction and native props", async () => {
  const mocks = new Map([
    [
      "react",
      `export const useContext=()=>({isRTL:true});export const createElement=(type,props,...children)=>({type,props:{...props,children}});`,
    ],
    ["react-native", `export const Text='NativeText',Platform={OS:'android'};`],
    ["@/contexts/I18nContext", `export const I18nContext={};`],
  ]);
  const hooks = registerHooks({
    resolve(name, ctx, next) {
      return mocks.has(name)
        ? { url: "rtl-test:" + name, shortCircuit: true }
        : next(name, ctx);
    },
    load(url, ctx, next) {
      return url.startsWith("rtl-test:")
        ? {
            format: "module",
            source: mocks.get(url.slice(9))!,
            shortCircuit: true,
          }
        : next(url, ctx);
    },
  });
  try {
    const { Text } = await import("../components/AppText");
    const centered = Text({
      style: { textAlign: "center" },
      selectable: true,
      children: "عنوان",
    }) as any;
    const flattened = Object.assign(
      {},
      ...centered.props.style.filter(Boolean),
    );
    assert.equal(flattened.textAlign, "center");
    assert.equal(flattened.direction, "ltr");
    assert.equal(centered.props.selectable, true);
    const phone = Text({
      style: { textAlign: "left", writingDirection: "ltr" },
      children: "+96550001234",
    }) as any;
    const phoneStyle = Object.assign({}, ...phone.props.style.filter(Boolean));
    assert.equal(phoneStyle.textAlign, "left");
    assert.equal(phoneStyle.writingDirection, "ltr");
  } finally {
    hooks.deregister();
  }
});
