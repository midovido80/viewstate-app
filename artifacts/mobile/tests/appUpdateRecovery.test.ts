import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const state = {
  value: "idle",
  result: { isAvailable: true },
  pending: false,
  nativeAvailable: false,
};
(globalThis as any).__otaTest = state;
(globalThis as any).__DEV__ = false;
(globalThis as any).React = {
  createElement: (type: unknown, props: unknown) => ({ type, props }),
};
const stubs = new Map([
  [
    "react",
    `export const createContext=()=>({Provider:'Provider'});export const useContext=()=>null;export const useEffect=()=>{};export const useCallback=f=>f;export const useRef=current=>({current});export const useState=()=>[globalThis.__otaTest.value,v=>globalThis.__otaTest.value=v];`,
  ],
  [
    "react/jsx-runtime",
    `export const jsx=(type,props)=>({type,props});export const jsxs=jsx;`,
  ],
  [
    "react-native",
    `export const Platform={OS:'android'};export const AppState={currentState:'active'};`,
  ],
  [
    "expo-updates",
    `export const isEnabled=true;export const useUpdates=()=>({isUpdateAvailable:globalThis.__otaTest.nativeAvailable,isUpdatePending:globalThis.__otaTest.pending});export const checkForUpdateAsync=async()=>globalThis.__otaTest.result;`,
  ],
  [
    "@/contexts/RealAccountContext",
    `export const useRealAccount=()=>undefined;`,
  ],
  [
    "@/services/circlePush",
    `export const syncCircleUpdateDevice=()=>{};export const refreshRegisteredCirclePush=()=>{};export const isCircleUpdatePush=()=>false;`,
  ],
]);
registerHooks({
  resolve(specifier, context, next) {
    return stubs.has(specifier)
      ? { url: "ota-stub:" + specifier, shortCircuit: true }
      : next(specifier, context);
  },
  load(url, context, next) {
    return url.startsWith("ota-stub:")
      ? {
          format: "module",
          source: stubs.get(url.slice(9))!,
          shortCircuit: true,
        }
      : next(url, context);
  },
});
test("a successful explicit update check lights the global badge before the native event arrives", async () => {
  const { AppUpdateProvider } = await import("../contexts/AppUpdateContext");
  const render = () =>
    (AppUpdateProvider({ children: null }) as any).props.value;
  state.value = "idle";
  state.nativeAvailable = false;
  state.pending = false;
  await render().check();
  assert.equal(render().available, true);
});
