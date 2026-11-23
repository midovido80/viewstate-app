export function migrateRequestDraft<
  T extends { driverRoom?: boolean; requestDraftVersion?: number },
>(draft: T): T {
  if (draft.requestDraftVersion === 2) return draft;
  return {
    ...draft,
    requestDraftVersion: 2,
    driverRoom: draft.driverRoom === true ? true : undefined,
  };
}
