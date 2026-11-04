import type { AccountScope, AccountStorage } from './accountScope';
import { createAccountRepository } from './accountFoundation';
import { createAssistantRepository, type AssistantExclusive } from './dailyAssistantRepository';
import { createMatchNoticeRepository } from './matchNotifications';

/** One immutable local bundle per verified login or trusted device restore; never reuse for another owner. */
export function createAccountRepositories<Store extends object>(
  scope: AccountScope,
  source: AccountStorage,
  createStore: (storage: AccountStorage, databaseName: string) => Store,
  exclusive: AssistantExclusive,
) {
  scope.assertActive();
  const rawStorage = scope.storage(source);
  const changes=new Set<()=>void>(),syncChanges=new Set<()=>void>();
  let queue:Promise<unknown>=Promise.resolve();
  const coordinate=<T>(work:()=>Promise<T>):Promise<T>=>{const run=queue.catch(()=>undefined).then(()=>{scope.assertActive();return exclusive(work);});queue=run;return run;};
  const mutating=new Set(['init','saveProperty','compareAndUpdate','deleteProperty','deletePropertiesSnapshot','savePerson','updatePerson','deletePerson','linkPersonToProperty','unlinkPersonFromProperty','setPropertySource','removePropertySource','saveRequirement','updateRequirement','update','undo','setItem','removeItem']);
  const serialized=<T extends object>(target:T):T=>new Proxy(target,{get(obj,key,receiver){const value=Reflect.get(obj,key,receiver);if(typeof value!=='function')return value;return mutating.has(String(key))?(...args:unknown[])=>coordinate(async()=>Reflect.apply(value,obj,args)).then(result=>{if(key!=='init'&&(!['setItem','removeItem'].includes(String(key))||['@viewstate_daily_assistant_v1','@viewstate_account_foundation_v1'].includes(String(args[0]))))for(const listener of changes)listener();return result;}):(...args:unknown[])=>Reflect.apply(value,obj,args);}});
  const storage=serialized(rawStorage),rawStore=scope.guard(createStore(rawStorage,scope.databaseName));
  return {
    scope,
    storage,
    store: serialized(rawStore),
    syncAccess:{exclusive:coordinate,store:rawStore,storage:rawStorage},
    subscribeChanges(listener:()=>void){changes.add(listener);return ()=>{changes.delete(listener);};},
    subscribeSync(listener:()=>void){syncChanges.add(listener);return ()=>{syncChanges.delete(listener);};},
    notifySync(){scope.assertActive();for(const listener of syncChanges)listener();},
    settings: serialized(scope.guard(createAccountRepository(rawStorage))),
    assistant: serialized(scope.guard(createAssistantRepository(rawStorage))),
    notices: serialized(scope.guard(createMatchNoticeRepository(rawStorage))),
    // Draft/recovery helpers must receive this same storage explicitly.
    // Media factories must receive these names, never their legacy defaults.
    mediaDatabaseName: scope.mediaDatabaseName,
    mediaDirectory: scope.mediaDirectory,
  };
}
