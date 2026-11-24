import type { CloudRequest } from "./workspaceCloud";
import { circleRpc } from "./circleMatchingApi";
import { circleInviteUrl } from "./circleInvitations";
export interface InviteBatchResult {
  results: { phone: string; status: "accepted" | "rate_limited" }[];
}
export interface InviteBatchDependencies {
  owner: string;
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    withExclusiveLock?<T>(name: string, work: () => Promise<T>): Promise<T>;
  };
  request: CloudRequest;
  randomId(): string;
  randomToken(): string;
  assertActive(): void;
}
const queues = new Map<string, Promise<unknown>>();
const canonicalPhones = (phones: readonly string[]) => {
  if (
    !phones.length ||
    phones.length > 50 ||
    phones.some((phone) => !/^\+[1-9][0-9]{6,14}$/.test(phone))
  )
    throw Error("CIRCLE_INVITE_SELECTION_INVALID");
  return [...new Set(phones)].sort();
};
type AppIntent = { id: string; phones: string[]; result?: InviteBatchResult };
type Draft = {
  version: 1;
  apps: Record<string, AppIntent>;
  links: Record<string, { token: string; createdAt: number }>;
};
export function createCircleInviteBatch({
  owner,
  storage,
  request,
  randomId,
  randomToken,
  assertActive,
}: InviteBatchDependencies) {
  const exclusive = <T>(work: () => Promise<T>) => {
    const result = (queues.get(owner) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => {
        assertActive();
        return storage.withExclusiveLock
          ? storage.withExclusiveLock("circle-invite-batch", async () => {
              assertActive();
              return work();
            })
          : work();
      });
    queues.set(owner, result);
    void result
      .finally(() => {
        if (queues.get(owner) === result) queues.delete(owner);
      })
      .catch(() => undefined);
    return result;
  };
  const key = (circle: string) =>
    `@viewstate/circle-invite-batch/v1/${owner}/${circle}`;
  async function read(circle: string): Promise<Draft> {
    const raw = await storage.getItem(key(circle));
    assertActive();
    if (!raw) return { version: 1, apps: {}, links: {} };
    let draft: Draft;
    try {
      draft = JSON.parse(raw);
    } catch {
      throw Error("CIRCLE_INVITE_DRAFT_DAMAGED");
    }
    const legacy = (draft as Draft & { app?: AppIntent })?.app;
    if (draft && !draft.apps)
      draft.apps =
        legacy && Array.isArray(legacy.phones)
          ? { [JSON.stringify(legacy.phones)]: legacy }
          : {};
    if (
      !draft ||
      draft.version !== 1 ||
      !draft.links ||
      typeof draft.links !== "object" ||
      Array.isArray(draft.links) ||
      Object.values(draft.links).some(
        (link) =>
          !link ||
          !/^[a-f0-9]{64}$/.test(link.token) ||
          !Number.isFinite(link.createdAt),
      ) ||
      !draft.apps ||
      typeof draft.apps !== "object" ||
      Array.isArray(draft.apps) ||
      Object.values(draft.apps).some(
        (app) =>
          !app || typeof app.id !== "string" || !Array.isArray(app.phones),
      )
    )
      throw Error("CIRCLE_INVITE_DRAFT_DAMAGED");
    return draft;
  }
  async function save(circle: string, draft: Draft) {
    assertActive();
    const raw = JSON.stringify(draft);
    await storage.setItem(key(circle), raw);
    assertActive();
    const stored = await storage.getItem(key(circle));
    assertActive();
    if (stored !== raw) throw Error("CIRCLE_INVITE_DRAFT_WRITE_FAILED");
  }
  function validatedResult(
    value: unknown,
    phones: string[],
  ): InviteBatchResult {
    const result = value as InviteBatchResult;
    if (
      !Array.isArray(result?.results) ||
      result.results.length !== phones.length ||
      result.results.some(
        (row) =>
          !row ||
          !phones.includes(row.phone) ||
          !["accepted", "rate_limited"].includes(row.status),
      ) ||
      new Set(result.results.map((row) => row.phone)).size !== phones.length
    )
      throw Error("CIRCLE_INVITE_RESPONSE_INVALID");
    return {
      results: result.results.map(({ phone, status }) => ({ phone, status })),
    };
  }
  return {
    sendApp(
      circleId: string,
      input: readonly string[],
      newAttempt = false,
    ): Promise<InviteBatchResult> {
      return exclusive(async () => {
        const phones = canonicalPhones(input),
          draft = await read(circleId);
        const selection = JSON.stringify(phones);
        if (
          !draft.apps[selection] ||
          (newAttempt && draft.apps[selection].result)
        ) {
          draft.apps[selection] = { id: randomId(), phones };
          await save(circleId, draft);
        }
        const app = draft.apps[selection];
        if (app.result) return validatedResult(app.result, phones);
        const result = await circleRpc(request, "vs_circle_invite_batch", {
          p_circle: circleId,
          p_operation: app.id,
          p_phones: phones,
        });
        assertActive();
        app.result = validatedResult(result, phones);
        await save(circleId, draft);
        return app.result;
      });
    },
    prepareWhatsApp(circleId: string, phone: string): Promise<string> {
      return exclusive(async () => {
        canonicalPhones([phone]);
        const draft = await read(circleId);
        if (
          !draft.links[phone] ||
          Date.now() - draft.links[phone].createdAt >= 7 * 24 * 60 * 60 * 1000
        ) {
          draft.links[phone] = { token: randomToken(), createdAt: Date.now() };
          await save(circleId, draft);
        }
        const token = draft.links[phone].token;
        await circleRpc(request, "vs_circle_invite_link", {
          p_circle: circleId,
          p_token: token,
        });
        assertActive();
        return circleInviteUrl(token);
      });
    },
  };
}
