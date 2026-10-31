import type { AccountScope, AccountStorage } from './accountScope';
import { createAccountRepository } from './accountFoundation';
import { createAssistantRepository, type AssistantExclusive } from './dailyAssistantRepository';
import { createMatchNoticeRepository } from './matchNotifications';

/** One bundle per verified login. Never reuse it for another owner or after revoke. */
export function createAccountRepositories<Store extends object>(
  scope: AccountScope,
  source: AccountStorage,
  createStore: (storage: AccountStorage, databaseName: string) => Store,
  exclusive: AssistantExclusive,
) {
  scope.assertActive();
  const storage = scope.storage(source);
  return {
    scope,
    storage,
    store: scope.guard(createStore(storage, scope.databaseName)),
    settings: scope.guard(createAccountRepository(storage)),
    assistant: scope.guard(createAssistantRepository(storage, exclusive)),
    notices: scope.guard(createMatchNoticeRepository(storage, exclusive)),
    // Draft/recovery helpers must receive this same storage explicitly.
    // Media factories must receive these names, never their legacy defaults.
    mediaDatabaseName: scope.mediaDatabaseName,
    mediaDirectory: scope.mediaDirectory,
  };
}
