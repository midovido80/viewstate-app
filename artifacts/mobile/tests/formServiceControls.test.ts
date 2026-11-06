import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const env = { rtl: false, states: [] as any[], cursor: 0 };
(globalThis as any).__formFeedback = env;
const mocks = new Map([
 ['react', `
 const createElement=(type,props,...children)=>({type,props:{...props,children:children.length>1?children:children[0]??props?.children}});
 globalThis.React={createElement}; export default globalThis.React; export {createElement}; export const Fragment='Fragment';
 export const isValidElement=x=>!!x&&typeof x==='object'&&'props' in x;
 const arr=x=>Array.isArray(x)?x.flatMap(arr):x===null||x===undefined||x===false?[]:[x];
 export const Children={toArray:arr};
 export const useState=initial=>{const e=globalThis.__formFeedback,i=e.cursor++; if(!(i in e.states))e.states[i]=typeof initial==='function'?initial():initial; return [e.states[i],v=>{e.states[i]=typeof v==='function'?v(e.states[i]):v}];};
 export const createContext=value=>({Provider:'Provider'}); export const useContext=()=>undefined;
 export const useRef=value=>({current:value}); export const useEffect=()=>{}; export const forwardRef=x=>x;
 `],
 ['react/jsx-runtime', `export const Fragment='Fragment';export const jsx=(type,props)=>({type,props});export const jsxs=jsx;`],
 ['react-native', `export const Modal='Modal',Pressable='Pressable',ScrollView='ScrollView',Text='Text',View='View',TextInput='TextInput',TouchableOpacity='TouchableOpacity';export const StyleSheet={create:x=>x};export const useWindowDimensions=()=>({width:390,fontScale:1});`],
 ['@expo/vector-icons', `export const Feather='Feather';`],
 ['@/hooks/useColors', `export const useColors=()=>({primary:'#2455EE',primaryForeground:'#FFFFFF',card:'#FFFFFF',foreground:'#173F78',border:'#CBD5E1'});`],
 ['@/contexts/I18nContext', `export const useI18n=()=>({isRTL:globalThis.__formFeedback.rtl,language:globalThis.__formFeedback.rtl?'ar':'en',fonts:{regular:'regular',medium:'medium',semiBold:'bold'}});`],
 ['@/components/FormField', `export const TextInput='TextInput';`],
 ['@/components/RequiredForm', `export const RequiredLabelText='RequiredLabelText';`],
 ['@/components/PropertyFormCard', `export const propertyFormInputStyle={};`],
]);
registerHooks({resolve(s,c,next){return mocks.has(s)?{url:'feedback:'+encodeURIComponent(s),shortCircuit:true}:next(s,c)},load(u,c,next){return u.startsWith('feedback:')?{format:'module',source:mocks.get(decodeURIComponent(u.slice(9)))!,shortCircuit:true}:next(u,c)}});
function render(component:any,props:any){env.cursor=0;return component(props)}
function nodes(x:any):any[]{return Array.isArray(x)?x.flatMap(nodes):x?.props?[x,...nodes(x.props.children)]:[]}

test('Service controls toggle directly, show dark selection and clear on a second tap in English and Arabic', async()=>{
 const {ChoiceTile,ChoiceGrid,CompactDropdown}=await import('../components/FormChoices.tsx');
 for(const rtl of [false,true]){
  env.rtl=rtl;env.states=[];let selected=false;let presses=0;
  const props=()=>({label:rtl?'تكييف مركزي':'Central AC',selected,role:'checkbox' as const,onPress:()=>{selected=!selected;presses++}});
  let tile=render(ChoiceTile,props());assert.equal(tile.type,'Pressable');assert.equal(tile.props.accessibilityState.checked,false);
  tile.props.onPress();tile=render(ChoiceTile,props());assert.equal(tile.props.style.backgroundColor,'#2455EE');assert.equal(tile.props.accessibilityState.checked,true);
  assert.equal(nodes(tile).some(n=>n.type===CompactDropdown),false);
  tile.props.onPress();tile=render(ChoiceTile,props());assert.equal(tile.props.style.backgroundColor,'#FFFFFF');assert.equal(presses,2);
  const grid=render(ChoiceGrid,{children:[{type:ChoiceTile,props:props()},{type:ChoiceTile,props:{...props(),label:'Elevator'}}]});assert.notEqual(grid.type,CompactDropdown);
  const radio=render(ChoiceGrid,{children:[{type:ChoiceTile,props:{...props(),role:'radio'}}]});assert.equal(radio.type,CompactDropdown,'existing descriptive lists keep their picker');
 }
});
test('Count dropdown offers unspecified first, real numbers and exact manual entry without a second unspecified control',async()=>{
 const {NumericQuickPick}=await import('../components/NumericQuickPick.tsx');
 const {CompactDropdown}=await import('../components/FormChoices.tsx');
 env.rtl=true;env.states=[];let value='';
 const props=()=>({scopeKey:'room',label:'غرف النوم',value,onChangeText:(v:string)=>{value=v},testID:'bedrooms',quickPickValues:[1,2,3,4,5,6,7,8,9,10]});
 let tree=render(NumericQuickPick,props());let picker=nodes(tree).find(n=>n.type===CompactDropdown);
 assert.equal(picker.props.options[0].label,'غير محدد');assert.equal(picker.props.options[0].value,'');
 picker.props.onSelect('4');assert.equal(value,'4');
 tree=render(NumericQuickPick,props());picker=nodes(tree).find(n=>n.type===CompactDropdown);picker.props.onSelect('manual');
 tree=render(NumericQuickPick,props());const input=nodes(tree).find(n=>n.type==='TextInput');assert.ok(input);input.props.onChangeText('40');assert.equal(value,'40');
 tree=render(NumericQuickPick,props());picker=nodes(tree).find(n=>n.type===CompactDropdown);picker.props.onSelect('');assert.equal(value,'');
});

test('Next numeric picker selects and closes in one tap; multi-select stays open until Done', async () => {
 const {CompactDropdown}=await import('../components/FormChoices.tsx');
 for (const rtl of [false,true]) {
  env.rtl=rtl;env.states=[];let chosen='';
  const props={label:rtl?'عدد الغرف':'Room count',options:[{value:'',label:'Not specified'},...Array.from({length:10},(_,i)=>({value:String(i+1),label:String(i+1)})),{value:'manual',label:'Other number'}],onSelect:(value:string)=>{chosen=value}};
  let tree=render(CompactDropdown,props);
  nodes(tree).find(n=>n.type==='Pressable' && n.props.accessibilityState?.expanded===false)!.props.onPress();
  tree=render(CompactDropdown,props);
  assert.equal(nodes(tree).find(n=>n.type==='Modal')!.props.visible,true);
  const four=nodes(tree).find(n=>n.type==='Pressable' && nodes(n).some(t=>t.type==='Text' && t.props.children==='4'))!;
  assert.equal(four.props.style.minHeight,48);
  assert.equal(four.props.style.width,'22%');
  four.props.onPress();assert.equal(chosen,'4');
  tree=render(CompactDropdown,props);
  assert.equal(nodes(tree).find(n=>n.type==='Modal')!.props.visible,false);
  assert.equal(nodes(tree).some(n=>n.type==='Text' && ['Done','تم'].includes(n.props.children)),false);
  env.states=[];
  const multiProps={...props,multiple:true};
  tree=render(CompactDropdown,multiProps);
  nodes(tree).find(n=>n.type==='Pressable' && n.props.accessibilityState?.expanded===false)!.props.onPress();
  tree=render(CompactDropdown,multiProps);
  nodes(tree).find(n=>n.type==='Pressable' && n.props.accessibilityRole==='checkbox')!.props.onPress();
  tree=render(CompactDropdown,multiProps);
  assert.equal(nodes(tree).find(n=>n.type==='Modal')!.props.visible,true);
  assert.ok(nodes(tree).some(n=>n.type==='Text' && ['Done','تم'].includes(n.props.children)));
 }
});
