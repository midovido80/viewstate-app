import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

(globalThis as any).React = {
  createElement: (type: any, props: any, ...children: any[]) => ({
    type,
    props: { ...props, children },
  }),
};
const stubs = new Map([
  ["react-native", "export const View='View',Text='Text';"],
  ["@/contexts/I18nContext", "export const useI18n=()=>({language:'ar'});"],
  [
    "./assistant/ui",
    "export const Action='Action',AssistantText='AssistantText';",
  ],
]);
registerHooks({
  resolve(name, ctx, next) {
    return stubs.has(name)
      ? { url: "join-ui:" + encodeURIComponent(name), shortCircuit: true }
      : next(name, ctx);
  },
  load(url, ctx, next) {
    return url.startsWith("join-ui:")
      ? {
          format: "module",
          source: stubs.get(decodeURIComponent(url.slice(8)))!,
          shortCircuit: true,
        }
      : next(url, ctx);
  },
});
const nodes = (value: any): any[] =>
  Array.isArray(value)
    ? value.flatMap(nodes)
    : value?.props
      ? [value, ...nodes(value.props.children)]
      : [];

test("recipient sees explicit Google email consent, then a cancellable waiting state without an accept button", async () => {
  const { CircleInvitationCard } =
    await import("../components/CircleInvitationCard");
  let accepted = 0,
    cancelled = 0;
  const props = {
    invite: {
      circle_id: "c",
      requires_review: true,
      approval_requested: false,
    },
    busy: false,
    onAccept: () => accepted++,
    onDecline: () => cancelled++,
  };
  let rendered = nodes(CircleInvitationCard(props));
  assert.match(JSON.stringify(rendered), /إظهار اسمك وبريد حساب جوجل/);
  rendered
    .find((row) => row.props.testID === "circle-accept-c")
    .props.onPress();
  assert.equal(accepted, 1);
  rendered = nodes(
    CircleInvitationCard({
      ...props,
      invite: { ...props.invite, approval_requested: true },
    }),
  );
  assert.equal(
    rendered.some((row) => row.props.testID === "circle-accept-c"),
    false,
  );
  assert.match(JSON.stringify(rendered), /بانتظار موافقة/);
  const cancel = rendered.find(
    (row) => row.props.testID === "circle-decline-c",
  );
  assert.equal(cancel.props.label, "إلغاء طلب الانضمام");
  cancel.props.onPress();
  assert.equal(cancelled, 1);
});
