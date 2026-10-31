import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { WebStore, SQLiteStore } from './persistence';
import { createAccountRepositories } from './accountRepositories';
import type { AccountScope } from './accountScope';
interface BrowserLocks { request<T>(name: string, options: { mode: 'exclusive' }, work: () => Promise<T>): Promise<T> }

/** Reuses the existing, validated domain stores; no generic cloud CRUD replacement. */
export function createAccountRepositoriesDevice(scope: AccountScope) {
  return createAccountRepositories(scope, AsyncStorage,
    (storage, databaseName) => Platform.OS === 'web'
      ? new WebStore(storage)
      : new SQLiteStore(() => SQLite.openDatabaseAsync(databaseName)),
    async work => {
      scope.assertActive();
      if (Platform.OS !== 'web') return work();
      const locks = (typeof navigator === 'undefined' ? undefined : navigator as unknown as { locks?: BrowserLocks })?.locks;
      if (!locks) throw new Error('SECURE_ACCOUNT_BROWSER_REQUIRED');
      return locks.request(`viewstate-account-${scope.userId}`, { mode: 'exclusive' }, async () => {
        scope.assertActive(); return work();
      });
    });
}
