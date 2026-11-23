import type { SeekerRequirement } from "@workspace/property-domain";
import {
  readBusiness,
  type SnapshotStore,
  type BusinessSnapshot,
} from "./workspaceSnapshot";
import { stableSync } from "./workspaceSync";

export async function deleteRequirementRecord(
  store: SnapshotStore & {
    replaceWorkspace(
      expected: BusinessSnapshot,
      next: BusinessSnapshot,
    ): Promise<void>;
  },
  expected: SeekerRequirement,
): Promise<"deleted" | "missing" | "stale"> {
  const before = await readBusiness(store),
    current = before.requirements.find((request) => request.id === expected.id);
  if (!current) return "missing";
  if (stableSync(current) !== stableSync(expected)) return "stale";
  try {
    await store.replaceWorkspace(before, {
      ...before,
      requirements: before.requirements.filter(
        (request) => request.id !== expected.id,
      ),
    });
  } catch (error) {
    if ((error as Error).message === "SYNC_LOCAL_CHANGED") return "stale";
    throw error;
  }
  return "deleted";
}
