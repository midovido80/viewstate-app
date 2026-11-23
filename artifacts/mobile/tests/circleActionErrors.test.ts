import test from "node:test";
import assert from "node:assert/strict";
import { circleRpc } from "../services/circleMatchingApi";

test("circle actions report only safe actionable error codes and never treat rejected RPCs as success", async () => {
  for (const code of [
    "CIRCLE_COOPERATION_COOLDOWN",
    "CIRCLE_MEMBER_REQUEST_LIMIT",
    "CIRCLE_REQUEST_LIMIT",
  ]) {
    await assert.rejects(
      circleRpc(
        async () =>
          new Response(JSON.stringify({ message: code }), { status: 400 }),
        "vs_circle_cooperation_request",
      ),
      new RegExp(code),
    );
  }
  await assert.rejects(
    circleRpc(
      async () =>
        new Response(JSON.stringify({ message: "PRIVATE_DATABASE_DETAIL" }), {
          status: 400,
        }),
      "vs_circle_request",
    ),
    /^Error: CIRCLE_ACTION_FAILED$/,
  );
});
