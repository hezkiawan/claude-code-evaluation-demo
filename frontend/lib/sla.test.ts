import { describe, expect, it } from "vitest";
import { ASSIGN_SLA_MS, isExpired } from "./sla";
import type { Room } from "./types";

const created = new Date("2026-09-24T10:00:00Z");
const at = (elapsedMs: number) => new Date(created.getTime() + elapsedMs);
const room = (overrides: Partial<Room> = {}): Room => ({
  id: "r1",
  name: "Nadia",
  platform: "whatsapp",
  status: "idle",
  createdAt: created.toISOString(),
  slaBreached: false,
  expired: false,
  ...overrides,
});

describe("isExpired", () => {
  it("uses a 5-minute SLA", () => {
    expect(ASSIGN_SLA_MS).toBe(5 * 60_000);
  });

  it("is false while an idle chat is within the SLA", () => {
    expect(isExpired(room(), at(ASSIGN_SLA_MS - 1_000))).toBe(false);
  });

  it("is false at exactly 5 minutes", () => {
    expect(isExpired(room(), at(ASSIGN_SLA_MS))).toBe(false);
  });

  it("is true once an idle chat waits past 5 minutes", () => {
    expect(isExpired(room(), at(ASSIGN_SLA_MS + 1_000))).toBe(true);
  });

  it("applies to bot chats too", () => {
    expect(isExpired(room({ status: "bot" }), at(ASSIGN_SLA_MS + 1_000))).toBe(true);
  });

  it.each(["assigned", "closed"] as const)("never marks %s chats as expired", (status) => {
    expect(isExpired(room({ status, expired: true }), at(60 * 60_000))).toBe(false);
  });

  it("trusts the server's expired flag when the client clock is behind", () => {
    expect(isExpired(room({ expired: true }), created)).toBe(true);
  });
});
