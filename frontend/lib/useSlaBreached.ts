import { useEffect, useState } from "react";
import { isSlaBreached, slaDeadlineMs } from "./sla";

// Browsers fire timers longer than this immediately.
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Live SLA-breach flag for a waiting room. Schedules a single timer for the
 * breach moment instead of polling, so the badge appears without a refresh.
 */
export function useSlaBreached(createdAt: string, active: boolean): boolean {
  const [breached, setBreached] = useState(() => active && isSlaBreached(createdAt, new Date()));

  useEffect(() => {
    const deadline = slaDeadlineMs(createdAt);
    if (!active || Number.isNaN(deadline)) {
      setBreached(false);
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining < 0) {
      setBreached(true);
      return;
    }
    setBreached(false);
    // +1ms: a breach is strictly more than the threshold.
    if (remaining + 1 > MAX_TIMER_MS) return;
    const id = setTimeout(() => setBreached(true), remaining + 1);
    return () => clearTimeout(id);
  }, [createdAt, active]);

  return breached;
}
