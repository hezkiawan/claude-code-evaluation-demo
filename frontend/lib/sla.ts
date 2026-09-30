import type { Room } from "./types";

// The longest a room may wait for a claim. Mirrors SLAThreshold in the backend.
export const SLA_THRESHOLD_SECONDS = 5 * 60;

// Whether a room's wait time at `now` is an SLA breach: whole seconds waited
// strictly greater than the threshold, so 5:00 (or 5:00.9) is not a breach —
// the same rule the backend records. Display hint only; the recorded breach
// comes from the backend at claim time.
export function isSlaBreached(room: Pick<Room, "createdAt">, now: Date): boolean {
  const waitSeconds = Math.floor((now.getTime() - new Date(room.createdAt).getTime()) / 1000);
  return waitSeconds > SLA_THRESHOLD_SECONDS;
}
