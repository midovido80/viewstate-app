import assert from "node:assert/strict";
import test from "node:test";

test("worker durably schedules failed and stale circles without abandoning later jobs", async () => {
  let serve!: (request: Request) => Promise<Response>;
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  Object.defineProperty(globalThis, "Deno", {
    configurable: true,
    value: {
      env: {
        get: (key: string) =>
          ({
            CIRCLE_WORKER_SECRET: "secret",
            SUPABASE_URL: "https://fixture.invalid",
            SUPABASE_SERVICE_ROLE_KEY: "role",
          })[key],
      },
      serve: (handler: typeof serve) => {
        serve = handler;
      },
    },
  });
  globalThis.fetch = async (input, options) => {
    const path = new URL(String(input)).pathname.split("/").at(-1)!;
    const body = JSON.parse(String(options?.body));
    calls.push(path + ":" + (body.p_circle ?? ""));
    if (
      path === "vs_circle_worker_retry" ||
      path === "vs_circle_worker_complete"
    ) {
      assert.equal(body.p_claim, `${body.p_circle}-claim`);
    }
    if (path === "vs_circle_worker_jobs")
      return Response.json(
        ["poison", "stale", "healthy"].map((circle_id) => ({
          circle_id,
          claim_id: `${circle_id}-claim`,
        })),
      );
    if (path === "vs_circle_worker_snapshot")
      return body.p_circle === "poison"
        ? new Response(null, { status: 500 })
        : Response.json({ revision: 1, properties: [], requests: [] });
    if (path === "vs_circle_worker_commit")
      return Response.json(body.p_circle === "healthy");
    if (path === "vs_circle_notification_claim") return Response.json([]);
    return Response.json(null);
  };
  try {
    await import("../../supabase/functions/circle-match-worker/index.ts");
    const response = await serve(
      new Request("https://fixture.invalid", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
      }),
    );
    assert.equal(response.status, 503);
    assert.ok(calls.includes("vs_circle_worker_retry:poison"));
    assert.ok(calls.includes("vs_circle_worker_retry:stale"));
    assert.ok(calls.includes("vs_circle_worker_commit:healthy"));
    assert.ok(calls.includes("vs_circle_worker_complete:healthy"));
  } finally {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, "Deno");
  }
});
