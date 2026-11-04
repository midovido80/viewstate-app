import { createOfflineAccountCache, offlineOwnerMatches } from './offlineAccount';
import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import { Platform, AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { NATIVE_ACCOUNT_CALLBACK, webAccountCallback } from './googleAccountContract';
import { createGoogleAccountService } from './googleAccountService';
import { createSecureSessionStorage } from './secureSessionStorage';

export interface GoogleAccountConfiguration { url: string; publishableKey: string }
/** Explicit factory: merely importing this module never signs in or reads old app data. */
export async function createGoogleAccountDevice(config: GoogleAccountConfiguration) {
  const base = new URL(config.url);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash
    || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) throw new Error('INVALID_SUPABASE_PUBLIC_CONFIG');
  const web = Platform.OS === 'web';
  const callback = web ? webAccountCallback(window.location.origin) : NATIVE_ACCOUNT_CALLBACK;
  let storage;
  if (web) {
    if (!window.isSecureContext || !globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) throw new Error('SECURE_AUTH_BROWSER_REQUIRED');
    storage = {
      getItem: async (key: string) => window.sessionStorage.getItem(key),
      setItem: async (key: string, value: string) => { window.sessionStorage.setItem(key, value); },
      removeItem: async (key: string) => { window.sessionStorage.removeItem(key); },
    };
    WebBrowser.maybeCompleteAuthSession();
  } else {
    const secure = await import('expo-secure-store');
    if (!await secure.isAvailableAsync()) throw new Error('SECURE_SESSION_STORAGE_UNAVAILABLE');
    storage = createSecureSessionStorage({
      getItem: key => secure.getItemAsync(key),
      setItem: (key, value) => secure.setItemAsync(key, value, { keychainAccessible: secure.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
      removeItem: key => secure.deleteItemAsync(key),
    }, Crypto.randomUUID);
    // The SDK's native PKCE fallback is "plain" without WebCrypto. Supply only
    // missing capabilities from Expo's OS-backed crypto, retaining existing APIs.
    const nativeCrypto = globalThis.crypto ?? {} as globalThis.Crypto;
    if (!nativeCrypto.getRandomValues) Object.defineProperty(nativeCrypto, 'getRandomValues', { value: Crypto.getRandomValues });
    if (!nativeCrypto.subtle) Object.defineProperty(nativeCrypto, 'subtle', { value: {
      digest: async (algorithm: string, bytes: BufferSource) => {
        if (algorithm !== 'SHA-256') throw new Error('UNSUPPORTED_AUTH_DIGEST');
        return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
      },
    } });
    if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: nativeCrypto, configurable: true });
  }
  const client = createClient(config.url, config.publishableKey, {
    auth: { storage, flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, lock: processLock },
  });
  let observedIdentity:string|null|undefined;
  const identityObserver=client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')observedIdentity=null;else if(session)observedIdentity=session.user.id.toLowerCase();});
  const lifecycle = !web ? AppState.addEventListener('change', state => {
    if (state === 'active') client.auth.startAutoRefresh(); else client.auth.stopAutoRefresh();
  }) : null;
  if (!web && AppState.currentState !== 'active') client.auth.stopAutoRefresh();
  const account = createGoogleAccountService(client, {
    callback,
    async open(url) {
      const target = new URL(url);
      if (target.origin !== base.origin || target.pathname !== '/auth/v1/authorize'
        || target.searchParams.get('provider') !== 'google' || target.searchParams.get('code_challenge_method') !== 's256') {
        throw new Error('UNSAFE_GOOGLE_AUTH_URL');
      }
      if (web) { window.location.assign(url); return { type: 'redirecting' }; }
      const result = await WebBrowser.openAuthSessionAsync(url, callback);
      return result.type === 'success' ? { type: 'success', url: result.url } : { type: 'cancelled' };
    },
  });
  const offline=createOfflineAccountCache(storage,`offline_${base.hostname.replace(/[^a-zA-Z0-9]/g,'_')}`);
  return { account, client, offline, configuration:config, callback,
    async restoreOffline(onRevoked:()=>void){
      const cached=await offline.read();if(!cached)return null;
      const raw=await storage.getItem(`sb-${base.hostname.split('.')[0]}-auth-token`);
      if(!offlineOwnerMatches(cached,raw,observedIdentity))return null;
      return {cached,lease:account.restoreLocalScope(cached.account,onRevoked)};
    },
    dispose() { account.dispose(); identityObserver.data.subscription.unsubscribe(); lifecycle?.remove(); client.auth.stopAutoRefresh(); } };
}
