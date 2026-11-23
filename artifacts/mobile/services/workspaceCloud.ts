import { AccountConnectionError } from "./googleAccountService";
import type { SyncCloud, CloudWorkspace, SyncRecords } from "./workspaceSync";
export type CloudRequest = (
  path: string,
  options?: {
    method?: string;
    body?: string | ArrayBuffer;
    contentType?: string;
    allowedStatus?: readonly number[];
  },
) => Promise<Response>;
export function createWorkspaceCloud(
  request: CloudRequest,
  userId: string,
): SyncCloud {
  function decode(value: unknown): CloudWorkspace {
    const row = value as {
      revision: number;
      payload: { version: number; records: SyncRecords };
    };
    if (
      !Number.isSafeInteger(row?.revision) ||
      row.revision < 0 ||
      row.payload?.version !== 1 ||
      !row.payload.records ||
      Array.isArray(row.payload.records) ||
      typeof row.payload.records !== "object"
    )
      throw new Error("SYNC_CLOUD_FORMAT");
    return { revision: row.revision, records: row.payload.records };
  }
  return {
    async read() {
      const response = await request(
        `/rest/v1/account_workspaces?user_id=eq.${encodeURIComponent(userId)}&select=revision,payload`,
      );
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > 1)
        throw new Error("SYNC_CLOUD_FORMAT");
      return rows.length ? decode(rows[0]) : { revision: 0, records: {} };
    },
    async write(expectedRevision, records) {
      const response = await request("/rest/v1/rpc/commit_account_workspace", {
        method: "POST",
        body: JSON.stringify({
          expected_revision: expectedRevision,
          next_payload: { version: 1, records },
        }),
      });
      const row = await response.json();
      if (typeof row?.accepted !== "boolean")
        throw new Error("SYNC_CLOUD_FORMAT");
      return { accepted: row.accepted, workspace: decode(row) };
    },
  };
}
/** Each request captures an owner-checked token. A later account switch cannot retarget an in-flight payload. */
export function createAccountCloudRequest(
  config: { url: string; publishableKey: string },
  token: () => Promise<string>,
  assertActive: () => void,
  fetcher: typeof fetch = fetch,
): CloudRequest {
  return async (path, options = {}) => {
    assertActive();
    const accessToken = await token();
    assertActive();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetcher(config.url.replace(/\/$/, "") + path, {
        method: options.method ?? "GET",
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${accessToken}`,
          ...(options.body !== undefined
            ? { "Content-Type": options.contentType ?? "application/json" }
            : {}),
        },
        body: options.body,
        signal: controller.signal,
      });
      assertActive();
      if (!response.ok && !options.allowedStatus?.includes(response.status)) {
        if (
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500
        )
          throw new AccountConnectionError();
        const error = new Error(`SYNC_HTTP_${response.status}`);
        throw error;
      }
      return response;
    } catch (error) {
      assertActive();
      if (error instanceof TypeError || (error as Error).name === "AbortError")
        throw new AccountConnectionError();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}
