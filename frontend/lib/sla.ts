import type { Room } from "./types";

// Mirrors AssignSLA in backend/handlers/sla.go.
export const ASSIGN_SLA_MS = 5 * 60_000;

// Computed client-side so the badge flips live; the server's flag covers a
// client clock that runs behind.
export function isExpired(room: Room, now: Date): boolean {
  if (room.status !== "idle" && room.status !== "bot") return false;
  return room.expired || now.getTime() - new Date(room.createdAt).getTime() > ASSIGN_SLA_MS;
}
