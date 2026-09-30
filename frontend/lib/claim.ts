import type { Room } from "./types";

// No login yet: every claim is made as this agent.
export const CURRENT_AGENT = "Agent Demo";

// Customers should not wait longer than this before an agent claims their room.
// Keep in sync with SLAWaitLimit in backend/handlers/claim.go.
export const SLA_WAIT_LIMIT_MS = 5 * 60 * 1000;

export function isClaimable(room: Room): boolean {
  return !room.assignedAgent && (room.status === "idle" || room.status === "bot");
}

// True once a room has been waiting past the SLA (live for unclaimed rooms,
// as recorded by the backend for claimed ones).
export function isSlaBreached(room: Room, now: Date): boolean {
  if (!isClaimable(room)) return room.slaBreached === true;
  return now.getTime() - new Date(room.createdAt).getTime() > SLA_WAIT_LIMIT_MS;
}
