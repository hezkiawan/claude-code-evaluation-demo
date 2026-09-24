import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assignRoom } from "./api";
import type { Room } from "./types";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);
afterAll(() => vi.unstubAllGlobals());

const assigned: Room = {
  id: "r1",
  name: "Nadia",
  platform: "whatsapp",
  status: "assigned",
  createdAt: "2026-09-24T10:00:00.000Z",
  assignedAt: "2026-09-24T10:06:00.000Z",
  slaBreached: true,
  expired: false,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("assignRoom", () => {
  beforeEach(() => fetchMock.mockReset());

  it("POSTs to /api/rooms/:id/assign and returns the updated room", async () => {
    fetchMock.mockResolvedValue(json(assigned));

    await expect(assignRoom("r1")).resolves.toEqual(assigned);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/rooms\/r1\/assign$/);
    expect(init?.method).toBe("POST");
  });

  it("URL-encodes the room id", async () => {
    fetchMock.mockResolvedValue(json(assigned));

    await assignRoom("a/b c");

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/rooms\/a%2Fb%20c\/assign$/);
  });

  it("surfaces the server's error message", async () => {
    fetchMock.mockResolvedValue(json({ error: "room is already assigned" }, 409));

    await expect(assignRoom("r1")).rejects.toThrow("room is already assigned");
  });
});
