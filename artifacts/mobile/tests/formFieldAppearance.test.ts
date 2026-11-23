import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { fieldSurface, formFieldColors } from '../constants/formFields.ts';

const hooks = { focused: false, invalid: false };
(globalThis as any).__fieldAppearanceTest = hooks;
const stubs = new Map([
  ['react', `const createElement = (type, props, ...children) => ({type, props: {...props, children}}); const React={createElement}; globalThis.React=React; export default React; export const forwardRef = fn => fn; export const createContext = value => ({value}); export const useContext = () => globalThis.__fieldAppearanceTest.invalid; export const useState = () => [globalThis.__fieldAppearanceTest.focused, v => {globalThis.__fieldAppearanceTest.focused=v;}];`],
  ['react/jsx-runtime', `export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;`],
  ['react-native', `const flatten = value => Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value || {}; export const StyleSheet = {flatten}; export const TextInput='NativeTextInput'; export const TouchableOpacity='TouchableOpacity';`],
]);
registerHooks({
  resolve(name, context, next) { return stubs.has(name) ? { url: 'field-test:' + encodeURIComponent(name), shortCircuit: true } : next(name, context); },
  load(url, context, next) { return url.startsWith('field-test:') ? {format:'module', source:stubs.get(decodeURIComponent(url.slice(11)))!, shortCircuit:true} : next(url, context); },
});
const flatten = (style: any): any => Object.assign({}, ...style.flat(Infinity).filter(Boolean));
const render = async (props: any, ref?: any) => {
  const {TextInput} = await import('../components/FormField.tsx');
  return (TextInput as any)(props, ref);
};

test('Focus and blur shade only the active input, preserve value/ref and call existing handlers once', async () => {
  hooks.focused=false; hooks.invalid=false;
  const calls: unknown[]=[]; const ref={current:null}; const event={nativeEvent:{text:'500'}};
  const props={value:'500', keyboardType:'decimal-pad', multiline:true, selection:{start:2,end:2}, onChangeText:(v:string)=>calls.push(v), onFocus:(e:unknown)=>calls.push(['focus',e]), onBlur:(e:unknown)=>calls.push(['blur',e]), style:{height:110,paddingHorizontal:22,textAlign:'right'}};
  let el=await render(props,ref);
  assert.equal(el.type,'NativeTextInput'); assert.equal(el.props.ref,ref);
  assert.equal(flatten(el.props.style).borderColor,formFieldColors.border);
  assert.equal(flatten(el.props.style).height,110); assert.equal(flatten(el.props.style).minHeight,110);
  el.props.onFocus(event); el=await render(props,ref);
  assert.equal(flatten(el.props.style).backgroundColor,formFieldColors.activeBackground);
  assert.equal(flatten(el.props.style).borderColor,formFieldColors.activeBorder);
  assert.equal(el.props.value,'500'); assert.equal(el.props.keyboardType,'decimal-pad'); assert.equal(el.props.multiline,true);
  assert.deepEqual(el.props.selection,{start:2,end:2}); assert.equal(flatten(el.props.style).paddingHorizontal,22);
  el.props.onChangeText('501'); el.props.onBlur(event); el=await render({...props,value:'501'},ref);
  assert.equal(flatten(el.props.style).backgroundColor,formFieldColors.background);
  assert.equal(el.props.value,'501'); assert.deepEqual(calls,[['focus',event],'501',['blur',event]]);
});

test('Required and legacy errors stay red during focus and recover without changing validation', async () => {
  hooks.focused=true; hooks.invalid=true;
  let el=await render({value:''});
  assert.equal(flatten(el.props.style).backgroundColor,formFieldColors.errorBackground);
  assert.equal(flatten(el.props.style).borderColor,formFieldColors.errorBorder);
  // A search inside an area picker is not the invalid required area itself.
  el=await render({inheritValidation:false,value:'Salmiya'});
  assert.equal(flatten(el.props.style).borderColor,formFieldColors.activeBorder);
  hooks.invalid=false;
  el=await render({style:[{borderColor:'#E5E7EB'},{borderColor:'#C52F3B'}]});
  assert.equal(flatten(el.props.style).borderColor,formFieldColors.errorBorder);
  el=await render({value:'500'});
  assert.equal(flatten(el.props.style).borderColor,formFieldColors.activeBorder);
});

test('Read-only inputs remain distinct and compact search dimensions are preserved', async () => {
  hooks.focused=true; hooks.invalid=false;
  for(const props of [{editable:false},{readOnly:true}]){
    const el=await render({...props,style:{height:40},testID:'search'});
    assert.equal(flatten(el.props.style).backgroundColor,formFieldColors.disabledBackground);
    assert.equal(flatten(el.props.style).height,40); assert.equal(flatten(el.props.style).minHeight,40);
    assert.equal(el.props.testID,'search');
  }
});

test('Dropdowns retain open/cancel state and callbacks, with error precedence over focus', async () => {
  hooks.focused=false; hooks.invalid=false;
  const {FieldSelect}=await import('../components/FormField.tsx');
  let pressed=0;
  const props={onPress:()=>pressed++,active:true,children:'Salmiya',style:{minHeight:54,flexDirection:'row'}};
  let el=(FieldSelect as any)(props,null);
  assert.equal(flatten(el.props.style).backgroundColor,formFieldColors.activeBackground);
  assert.equal(el.props.accessibilityState.expanded,true);
  el.props.onPress(); assert.equal(pressed,1);
  el=(FieldSelect as any)({...props,active:false},null);
  assert.equal(flatten(el.props.style).borderColor,formFieldColors.border);
  el=(FieldSelect as any)({...props,invalid:true},null);
  assert.equal(flatten(el.props.style).borderColor,formFieldColors.errorBorder);
});

test('All application text inputs use the shared field rather than bypassing its state styling', async () => {
  const files: string[]=[];
  async function walk(dir:string){for(const entry of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+entry.name;if(entry.isDirectory())await walk(p);else if(p.endsWith('.tsx'))files.push(p);}}
  await walk('app'); await walk('components');
  for(const file of files){
    if(file==='components/FormField.tsx')continue;
    const text=await readFile(file,'utf8');
    assert.doesNotMatch(text,/import\s*\{[^}]*\bTextInput\s*(?:,|\})[^;]*from\s*['"]react-native['"]/,file);
  }
  assert.notEqual(fieldSurface().borderColor,fieldSurface({active:true}).borderColor);
});
