// Customers should be claimed within 5 minutes.
// Keep in sync with slaThreshold in backend/handlers/claim.go (the backend decides the recorded breach).
export const SLA_THRESHOLD_MS = 5 * 60_000;

/** Epoch ms when the room breaches its SLA, or NaN if createdAt can't be parsed. */
export function slaDeadlineMs(createdAt: string): number {
  return Date.parse(createdAt) + SLA_THRESHOLD_MS;
}

/** A room breaches its SLA once it has waited strictly longer than the threshold. */
export function isSlaBreached(createdAt: string, now: Date): boolean {
  const deadline = slaDeadlineMs(createdAt);
  return !Number.isNaN(deadline) && now.getTime() > deadline;
}
