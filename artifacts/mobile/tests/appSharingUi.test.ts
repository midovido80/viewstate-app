import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const state = {
  values: [] as any[],
  cursor: 0,
  effects: [] as (() => unknown)[],
  deps: [] as any[],
  cleanups: [] as any[],
  calls: [] as { name: string; params: any }[],
  opened: [] as string[],
  storage: new Map<string, string>(),
  contacts: 0,
  ar: true,
  permission: "granted",
  offline: false,
  owner: "owner-a",
  renewRequest: false,
  platform: "android",
  failResultWrite: false,
};
(globalThis as any).__inviteUI = state;
(globalThis as any).React = {
  createElement: (type: any, props: any, ...children: any[]) => ({
    type,
    props: { ...props, children: children.length ? children : props?.children },
  }),
};
const stubs = new Map([
  [
    "react",
    `
    export const useState=initial=>{const s=globalThis.__inviteUI,i=s.cursor++;if(!(i in s.values))s.values[i]=typeof initial==='function'?initial():initial;return [s.values[i],v=>s.values[i]=typeof v==='function'?v(s.values[i]):v];};
    export const useRef=initial=>{const s=globalThis.__inviteUI,i=s.cursor++;return s.values[i]??(s.values[i]={current:initial});};
    export const useMemo=(fn,deps)=>{const s=globalThis.__inviteUI,i=s.cursor++;if(!s.deps[i]||deps.some((v,n)=>v!==s.deps[i][n])){s.deps[i]=deps;s.values[i]=fn();}return s.values[i];};
    export const useEffect=(fn,deps)=>{const s=globalThis.__inviteUI,i=s.cursor++;if(!s.deps[i]||deps.some((v,n)=>v!==s.deps[i][n])){s.deps[i]=deps;s.effects.push(()=>{s.cleanups[i]?.();s.cleanups[i]=fn();});}};
  `,
  ],
  [
    "react-native",
    `export const View='View',Text='Text',Modal='Modal',Pressable='Pressable',FlatList='FlatList',KeyboardAvoidingView='KeyboardAvoidingView',ActivityIndicator='ActivityIndicator';export const Platform={get OS(){return globalThis.__inviteUI.platform}};export const Linking={openURL:async url=>{globalThis.__inviteUI.opened.push(url)},openSettings:async()=>{}};export const Share={share:async value=>{globalThis.__inviteUI.opened.push('share:'+value.message)}};`,
  ],
  ["expo-router", `export const useRouter=()=>({push:()=>{}});`],
  [
    "expo-crypto",
    `let n=0;export const randomUUID=()=> 'operation-'+(++n);export const getRandomBytes=()=>Uint8Array.from({length:32},()=>++n%256);`,
  ],
  ["@expo/vector-icons", `export const Feather='Feather';`],
  [
    "@/hooks/useScreenInsets",
    `export const useScreenInsets=()=>({top:0,bottom:0});`,
  ],
  [
    "@/hooks/useColors",
    `export const useColors=()=>({foreground:'black',card:'white',background:'white',border:'gray',primary:'blue',destructive:'red'});`,
  ],
  [
    "@/contexts/I18nContext",
    `export const useI18n=()=>({language:globalThis.__inviteUI.ar?'ar':'en',isRTL:globalThis.__inviteUI.ar,fonts:{regular:'r',semiBold:'s',bold:'b'},t:k=>k});`,
  ],
  [
    "@/contexts/RealAccountContext",
    `const request=async(path,options)=>{const s=globalThis.__inviteUI,p=JSON.parse(options?.body??'{}'),name=path.split('/').at(-1);s.calls.push({name,params:p});if(s.offline)throw Error('offline');return Response.json(name==='vs_circle_list'?[{id:'circle-a',name:'Test Circle',owner_id:s.owner}]:name==='vs_circle_invite_batch'?{results:p.p_phones.map(phone=>({phone,status:'accepted'}))}:null);};export const useRealAccount=()=>({profile:{user_id:globalThis.__inviteUI.owner,display_name:'Sender'},request:globalThis.__inviteUI.renewRequest?(...args)=>request(...args):request});`,
  ],
  [
    "@/contexts/UserDataContext",
    `const s=globalThis.__inviteUI;const store={getPeople:async()=>[{id:'a',name:'أحمد',displayPhone:'50001234',normalizedPhone:'+96550001234',classifications:['broker'],notes:''},{id:'b',name:'سالم',displayPhone:'50005678',normalizedPhone:'+96550005678',classifications:['rent_seeker'],notes:''}]};const storage={getItem:async k=>s.storage.get(k)??null,setItem:async(k,v)=>{s.storage.set(k,v);if(s.failResultWrite&&v.includes('"result":')){s.failResultWrite=false;throw Error('uncertain-write')}}};export const useUserData=()=>({store,storage});`,
  ],
  [
    "expo-contacts",
    `export const Fields={FirstName:'firstName',LastName:'lastName',PhoneNumbers:'phoneNumbers'},SortTypes={FirstName:'firstName'};export const requestPermissionsAsync=async()=>{globalThis.__inviteUI.contacts++;return {status:globalThis.__inviteUI.permission,canAskAgain:false,accessPrivileges:'limited'}};export const getContactsAsync=async()=>({data:[{id:'native',name:'زميل الهاتف',phoneNumbers:[{number:'+96550001234'},{number:'+96550009999'}]}],hasNextPage:false});`,
  ],
  ["./Button", `export const Button='Button';`],
  ["./FormField", `export const TextInput='TextInput';`],
  ["./FormChoices", `export const CompactDropdown='CompactDropdown';`],
  [
    "./PhoneCountrySheet",
    `export const PhoneCountrySheet='PhoneCountrySheet';`,
  ],
  ["./PhoneNumberText", `export const PhoneNumberText='PhoneNumberText';`],
  [
    "./KeyboardAwareScrollViewCompat",
    `export const KeyboardAwareScrollViewCompat='ScrollView';`,
  ],
]);
stubs.set(
  "@/contexts/GuestAccountContext",
  "export const useGuestAccount=()=>null;",
);
stubs.set(
  "./ui",
  `export const AccountScreen='Screen',Card='Card',ErrorText='ErrorText',Note='Note',Row='Row';export const useL=()=>({L:(a,e)=>globalThis.__inviteUI.ar?a:e,language:globalThis.__inviteUI.ar?'ar':'en',fonts:{regular:'Arial'},align:'right'});`,
);
for (const [name, exp] of [
  ["@/components/FormField", "TextInput"],
  ["@/components/Button", "Button"],
  ["@/components/PhoneNumberText", "PhoneNumberText"],
  ["@/components/PhoneCountrySheet", "PhoneCountrySheet"],
])
  stubs.set(name, "export const " + exp + "=" + JSON.stringify(exp) + ";");
registerHooks({
  resolve(name, ctx, next) {
    return stubs.has(name)
      ? { url: "invite-ui:" + encodeURIComponent(name), shortCircuit: true }
      : next(name, ctx);
  },
  load(url, ctx, next) {
    return url.startsWith("invite-ui:")
      ? {
          format: "module",
          source: stubs.get(decodeURIComponent(url.slice(10)))!,
          shortCircuit: true,
        }
      : next(url, ctx);
  },
});
const elements = (value: any): any[] =>
  Array.isArray(value)
    ? value.flatMap(elements)
    : value?.props
      ? [
          value,
          ...elements(value.props.children),
          ...elements(value.props.ListHeaderComponent),
          ...elements(value.props.ListFooterComponent),
          ...(value.type === "FlatList"
            ? (value.props.data ?? []).flatMap((item: any, index: number) =>
                elements(value.props.renderItem({ item, index })),
              )
            : []),
        ]
      : [];
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("settings app invitations keep selections across sources and open only explicit WhatsApp or general shares", async () => {
  const { AppSharingSection } =
    await import("../components/account/AppSharingSection");
  const component = AppSharingSection().type;
  const render = () => {
    state.cursor = 0;
    const tree = elements(component());
    for (const e of state.effects.splice(0)) e();
    return tree;
  };
  const settle = async () => {
    for (let n = 0; n < 5; n++) {
      await tick();
      render();
    }
  };
  const find = (id: string) => {
    const row = render().find((x) => x.props.testID === id);
    assert.ok(row, id);
    return row;
  };
  render();
  await settle();
  assert.equal(state.contacts, 0);
  find("app-invite-select-+96550001234").props.onPress();
  find("app-invite-source-phone").props.onPress();
  await settle();
  find("app-invite-select-+96550009999").props.onPress();
  find("app-invite-review").props.onPress();
  assert.equal(
    render().filter((x) => x.props.testID?.startsWith("app-invite-whatsapp-"))
      .length,
    2,
  );
  assert.equal(
    state.calls.length,
    0,
    "no server account lookup or invitation RPC",
  );
  assert.equal(state.opened.length, 0);
  find("app-invite-whatsapp-+96550001234").props.onPress();
  await settle();
  assert.equal(state.opened.length, 1);
  assert.ok(state.opened[0].startsWith("whatsapp://send?"));
  assert.ok(
    new URL(state.opened[0]).searchParams
      .get("text")!
      .includes("https://viewstate-download."),
  );
  find("app-share-general").props.onPress();
  await settle();
  assert.ok(state.opened[1].startsWith("share:"));
  for (const cleanup of state.cleanups) cleanup?.();
});
