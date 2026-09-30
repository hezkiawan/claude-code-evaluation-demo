import { describe, expect, it } from "vitest";
import { SLA_THRESHOLD_MS, isSlaBreached, slaDeadlineMs } from "@/lib/sla";

const created = "2026-09-30T10:00:00.000Z";
const at = (offsetMs: number) => new Date(Date.parse(created) + offsetMs);

describe("SLA helpers", () => {
  it("uses a 5 minute threshold", () => {
    expect(SLA_THRESHOLD_MS).toBe(5 * 60_000);
  });

  it("computes the deadline 5 minutes after creation", () => {
    expect(slaDeadlineMs(created)).toBe(Date.parse(created) + 5 * 60_000);
  });

  it("is not breached at 4m59s", () => {
    expect(isSlaBreached(created, at(4 * 60_000 + 59_000))).toBe(false);
  });

  it("is not breached at exactly 5m", () => {
    expect(isSlaBreached(created, at(5 * 60_000))).toBe(false);
  });

  it("is breached after 5m", () => {
    expect(isSlaBreached(created, at(5 * 60_000 + 1_000))).toBe(true);
  });

  it("never reports a breach for an unparseable timestamp", () => {
    expect(slaDeadlineMs("not-a-date")).toBeNaN();
    expect(isSlaBreached("not-a-date", at(60 * 60_000))).toBe(false);
  });
});
