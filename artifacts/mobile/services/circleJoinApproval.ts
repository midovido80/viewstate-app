import { circleRpc } from "./circleMatchingApi";
import type { CloudRequest } from "./workspaceCloud";
import type { CircleInvitation } from "../components/CircleInvitationCard";

export type CircleJoinReview = {
  id: string;
  user_id: string;
  display_name: string;
  google_email: string;
  requested_at: string;
};

export async function acceptCircleInvitation(
  request: CloudRequest,
  invite: CircleInvitation,
) {
  if (invite.approval_requested) return "pending" as const;
  await circleRpc(
    request,
    invite.requires_review ? "vs_circle_request_join" : "vs_circle_accept",
    { p_circle: invite.circle_id },
  );
  return invite.requires_review ? ("pending" as const) : ("joined" as const);
}

export function listCircleJoinReviews(request: CloudRequest, circle: string) {
  return circleRpc<CircleJoinReview[]>(request, "vs_circle_join_reviews", {
    p_circle: circle,
  });
}

export function reviewCircleJoin(
  request: CloudRequest,
  circle: string,
  review: string,
  approve: boolean,
) {
  return circleRpc(request, "vs_circle_review_join", {
    p_circle: circle,
    p_review: review,
    p_approve: approve,
  });
}
