import type { Room } from "./types";

// No login yet: every claim is made as this demo agent.
export const CURRENT_AGENT_NAME = "Agent Demo";

/** Unassigned, open rooms can be claimed. Mirrors claimableStatuses in backend/handlers/claim.go. */
export function isClaimable(room: Room): boolean {
  return room.status === "idle" || room.status === "bot";
}
