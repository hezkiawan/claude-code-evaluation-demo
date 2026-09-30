import { afterEach, describe, expect, it, vi } from "vitest";
import { claimRoom } from "@/lib/api";

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("claimRoom", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the agent name to the claim endpoint", async () => {
    const room = { id: "r1", status: "assigned", assignedAgent: "Agent Demo" };
    const fetchMock = mockFetch(200, room);

    await expect(claimRoom("r1", "Agent Demo")).resolves.toEqual(room);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/rooms\/r1\/claim$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ agentName: "Agent Demo" });
  });

  it("encodes the room id in the path", async () => {
    const fetchMock = mockFetch(200, {});
    await claimRoom("a/b", "Agent Demo");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/rooms\/a%2Fb\/claim$/);
  });

  it("surfaces the API error message on conflict", async () => {
    mockFetch(409, { error: "room is already claimed by another agent" });
    await expect(claimRoom("r1", "Agent Demo")).rejects.toThrow("room is already claimed by another agent");
  });
});
