import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptCircleInvitation,
  reviewCircleJoin,
} from "../services/circleJoinApproval";
import type { CloudRequest } from "../services/workspaceCloud";

test("Google invitation acceptance requests owner review and never activates membership", async () => {
  const calls: { path: string; body: unknown }[] = [];
  const request: CloudRequest = async (path, options) => {
    calls.push({ path, body: JSON.parse(String(options?.body)) });
    return Response.json(null);
  };
  assert.equal(
    await acceptCircleInvitation(request, {
      circle_id: "a",
      requires_review: true,
    }),
    "pending",
  );
  assert.deepEqual(calls, [
    { path: "/rest/v1/rpc/vs_circle_request_join", body: { p_circle: "a" } },
  ]);
  await acceptCircleInvitation(request, {
    circle_id: "a",
    requires_review: true,
    approval_requested: true,
  });
  assert.equal(
    calls.length,
    1,
    "pending request does not send a second accept",
  );
  await reviewCircleJoin(request, "a", "review-envelope", true);
  assert.deepEqual(calls[1], {
    path: "/rest/v1/rpc/vs_circle_review_join",
    body: { p_circle: "a", p_review: "review-envelope", p_approve: true },
  });
});

test("legacy explicit invitations still join, failed requests never report pending success", async () => {
  let pathSeen = "";
  const request: CloudRequest = async (path) => {
    pathSeen = path;
    return Response.json(null);
  };
  assert.equal(
    await acceptCircleInvitation(request, { circle_id: "legacy" }),
    "joined",
  );
  assert.ok(pathSeen.endsWith("vs_circle_accept"));
  await assert.rejects(
    acceptCircleInvitation(
      async () => {
        throw Error("offline");
      },
      { circle_id: "a", requires_review: true },
    ),
    /offline/,
  );
});
