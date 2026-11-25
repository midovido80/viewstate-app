import test from "node:test";
import assert from "node:assert/strict";
import {
  circleMemberName,
  circleMemberPhone,
} from "../services/circleMemberAttribution.ts";
test("member attribution preserves names and restricts telephone URLs to phone characters", () => {
  assert.equal(
    circleMemberName(
      { user_id: "id", display_name: " أحمد ", company: "", phone: "" },
      true,
    ),
    "أحمد",
  );
  assert.equal(circleMemberName(undefined, true), "عضو لم يحدد اسمه");
  assert.equal(circleMemberPhone("+965 5000-1234"), "+96550001234");
  assert.equal(circleMemberPhone("50001234"), "50001234");
  assert.equal(circleMemberPhone("javascript:alert(1)"), undefined);
  assert.equal(circleMemberPhone(""), undefined);
});
import { registerHooks } from "node:module";
test("member card renders colleague attribution and opens only the dialer on explicit action", async () => {
  const calls: string[] = [];
  (globalThis as any).__memberCalls = calls;
  (globalThis as any).React = {
    createElement: (type: any, props: any, ...children: any[]) => ({
      type,
      props: { ...props, children },
    }),
  };
  const mocks = new Map([
    ["react", `export const useState=()=>[false,()=>{}];`],
    [
      "react-native",
      `export const View='View';export const Linking={openURL:async url=>globalThis.__memberCalls.push(url)};`,
    ],
    [
      "@/components/assistant/ui",
      `export const AssistantText='Text',Action='Action';`,
    ],
    ["@/contexts/I18nContext", `export const useI18n=()=>({language:'ar'});`],
  ]);
  const hooks = registerHooks({
    resolve(name, ctx, next) {
      return mocks.has(name)
        ? { url: "member-test:" + name, shortCircuit: true }
        : next(name, ctx);
    },
    load(url, ctx, next) {
      return url.startsWith("member-test:")
        ? {
            format: "module",
            source: mocks.get(url.slice(12))!,
            shortCircuit: true,
          }
        : next(url, ctx);
    },
  });
  try {
    const { CircleMemberAttribution } =
      await import("../components/CircleMemberAttribution");
    const member = {
      user_id: "broker",
      display_name: "أحمد",
      company: "مكتب الاختبار",
      phone: "+965 5000-1234",
    };
    const card = CircleMemberAttribution({ member }) as any;
    assert.match(JSON.stringify(card), /أحمد/);
    assert.match(JSON.stringify(card), /مكتب الاختبار/);
    assert.deepEqual(calls, []);
    const nodes = (node: any): any[] =>
      !node || typeof node !== "object"
        ? []
        : Array.isArray(node)
          ? node.flatMap(nodes)
          : [node, ...nodes(node.props?.children)];
    const action = nodes(card).find((n) => n.type === "Action");
    assert.ok(action);
    action.props.onPress();
    await Promise.resolve();
    assert.deepEqual(calls, ["tel:+96550001234"]);
    assert.ok(
      !nodes(CircleMemberAttribution({ member, own: true })).some(
        (n) => n.type === "Action",
      ),
    );
    assert.ok(
      !nodes(
        CircleMemberAttribution({ member: { ...member, phone: "" } }),
      ).some((n) => n.type === "Action"),
    );
  } finally {
    hooks.deregister();
    delete (globalThis as any).__memberCalls;
  }
});
