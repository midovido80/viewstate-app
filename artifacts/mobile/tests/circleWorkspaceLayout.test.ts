import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import {
  circleControlColumns,
  circleHeaderTopInset,
} from "../services/circleWorkspaceLayout";

test("circle controls preserve readable widths at phone sizes and scale into one column for large text", () => {
  for (const screen of [320, 360, 390, 430])
    assert.equal(circleControlColumns(screen - 32, 1, "tabs"), 2);
  assert.equal(circleControlColumns(768 - 32, 1, "tabs"), 4);
  for (const kind of ["tabs", "actions"] as const)
    assert.equal(circleControlColumns(328, 2, kind), 1);
  for (const [width, expected] of [
    [263, 1],
    [264, 2],
    [535, 2],
    [536, 4],
  ] as const)
    assert.equal(circleControlColumns(width, 1, "tabs"), expected);
  assert.equal(circleControlColumns(263, 1, "actions"), 1);
  assert.equal(circleControlColumns(264, 1, "actions"), 2);
});

test("the circle header consumes the upper safe area only when the banner has not already occupied it", () => {
  assert.equal(circleHeaderTopInset(40, true), 8);
  assert.equal(circleHeaderTopInset(40, false), 40);
  assert.equal(circleHeaderTopInset(56, false), 56);
});

test("real circle controls render Arabic and English labels, matching states, actions and forwarded layout props", async () => {
  const state = { values: [] as any[], cursor: 0, ar: true, fontScale: 1 };
  (globalThis as any).__circleLayout = state;
  const mocks = new Map([
    [
      "react",
      `const React={createElement:(type,props,...children)=>({type,props:{...props,children}})};export default React;export const useState=initial=>{const s=globalThis.__circleLayout,i=s.cursor++;if(!(i in s.values))s.values[i]=initial;return [s.values[i],v=>s.values[i]=v]};`,
    ],
    [
      "react-native",
      `export const View='View',Pressable='Pressable',Switch='Switch';export const useWindowDimensions=()=>({fontScale:globalThis.__circleLayout.fontScale});`,
    ],
    ["@expo/vector-icons", `export const Feather='Feather';`],
    ["./AppText", `export const Text='Text';`],
    ["./Button", `export const Button='Button';`],
    [
      "@/contexts/I18nContext",
      `export const useI18n=()=>({isRTL:globalThis.__circleLayout.ar,language:globalThis.__circleLayout.ar?'ar':'en',fonts:{regular:'regular',semiBold:'semibold'}});`,
    ],
    [
      "@/hooks/useColors",
      `export const useColors=()=>({primary:'#2454ED',primaryForeground:'#fff',foreground:'#1B2940',mutedForeground:'#607086',card:'#fff',accent:'#18355C',background:'#F5F7FC',destructive:'#D73C4A'});`,
    ],
  ]);
  const hooks = registerHooks({
    resolve(name, ctx, next) {
      return mocks.has(name)
        ? { url: "circle-layout:" + name, shortCircuit: true }
        : next(name, ctx);
    },
    load(url, ctx, next) {
      return url.startsWith("circle-layout:")
        ? {
            source: mocks.get(url.slice(14))!,
            format: "module",
            shortCircuit: true,
          }
        : next(url, ctx);
    },
  });
  const nodes = (node: any): any[] =>
    !node || typeof node !== "object"
      ? []
      : Array.isArray(node)
        ? node.flatMap(nodes)
        : [node, ...nodes(node.props?.children)];
  const render = (component: any, props: any) => {
    state.cursor = 0;
    return component(props);
  };
  try {
    const { CircleSectionTabs, CircleMatchingStatus, CircleWorkspaceActions } =
      await import("../components/CircleWorkspaceControls");
    const selected: string[] = [];
    const style = { marginTop: 24 };
    let layouts = 0;
    const props = {
      selected: "opportunities",
      onSelect: (v: string) => selected.push(v),
      testID: "consumer-tabs",
      style,
      onLayout: () => layouts++,
    };
    let tabs = render(CircleSectionTabs, props);
    assert.equal(tabs.props.testID, "consumer-tabs");
    assert.equal(tabs.props.style.at(-1), style);
    tabs.props.onLayout({ nativeEvent: { layout: { width: 328 } } });
    assert.equal(layouts, 1);
    tabs = render(CircleSectionTabs, props);
    const choices = nodes(tabs).filter((n) => n.type === "Pressable");
    assert.deepEqual(
      choices.map((n) => n.props.accessibilityLabel),
      ["الفرص", "العقارات", "الطلبات", "الأعضاء"],
    );
    assert.ok(
      choices.every((n) => n.props.style({ pressed: false }).flexBasis === 160),
    );
    assert.ok(
      choices.every((n) => n.props.style({ pressed: false }).minHeight >= 48),
    );
    choices[2].props.onPress();
    assert.deepEqual(selected, ["requests"]);
    choices[0].props.onFocus();
    assert.equal(
      nodes(render(CircleSectionTabs, props))
        .find((n) => n.type === "Pressable")
        .props.style({ pressed: false }).borderWidth,
      2,
    );
    choices[0].props.onBlur();
    state.fontScale = 2;
    assert.equal(
      nodes(render(CircleSectionTabs, props))
        .find((n) => n.type === "Pressable")
        .props.style({ pressed: false }).flexBasis,
      328,
    );
    state.ar = false;
    assert.equal(
      nodes(render(CircleSectionTabs, props)).find(
        (n) => n.type === "Pressable",
      ).props.accessibilityLabel,
      "Opportunities",
    );
    state.ar = true;
    let chosen = 0;
    const toggles: boolean[] = [];
    for (const variant of [
      { enabled: false, failed: false, processing: false },
      { enabled: true, failed: false, processing: false },
      { enabled: true, failed: false, processing: true },
      { enabled: true, failed: true, processing: false },
    ]) {
      state.values = [];
      const status = render(CircleMatchingStatus, {
        ...variant,
        busy: false,
        lastChecked: "2026-11-25T09:26:00Z",
        onChoose: () => chosen++,
        onToggle: (v: boolean) => toggles.push(v),
        testID: "status",
        style,
      });
      const toggle = nodes(status).find((n) => n.type === "Switch");
      assert.equal(toggle.props.value, variant.enabled);
      assert.equal(toggle.props.disabled, variant.failed);
      toggle.props.onValueChange(false);
      nodes(status)
        .find((n) => n.type === "Pressable")
        .props.onPress();
      assert.equal(status.props.style.at(-1), style);
      assert.match(JSON.stringify(status), /آخر تحديث/);
    }
    assert.equal(chosen, 4);
    assert.deepEqual(toggles, [false, false, false, false]);
    state.values = [];
    let shared = 0,
      invited = 0;
    const actions = render(CircleWorkspaceActions, {
      busy: false,
      onShare: () => shared++,
      onInvite: () => invited++,
    });
    actions.props.onLayout({ nativeEvent: { layout: { width: 288 } } });
    state.fontScale = 2;
    const buttons = nodes(
      render(CircleWorkspaceActions, {
        busy: false,
        onShare: () => shared++,
        onInvite: () => invited++,
      }),
    ).filter((n) => n.type === "Button");
    assert.ok(buttons.every((n) => n.props.style.flexBasis === 288));
    buttons[0].props.onPress();
    buttons[1].props.onPress();
    assert.equal(shared, 1);
    assert.equal(invited, 1);
    assert.ok(
      nodes(
        render(CircleWorkspaceActions, {
          busy: true,
          onShare: () => {},
          onInvite: () => {},
        }),
      )
        .filter((n) => n.type === "Button")
        .every((n) => n.props.disabled),
    );
  } finally {
    hooks.deregister();
    delete (globalThis as any).__circleLayout;
  }
});
