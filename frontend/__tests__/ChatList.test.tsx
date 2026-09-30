import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatList from "@/components/ChatList";
import type { Room, RoomStatus } from "@/lib/types";

const CREATED_AT = "2026-09-30T09:00:00Z";

function room(id: string, name: string, status: RoomStatus, extra: Partial<Room> = {}): Room {
  return { id, name, platform: "whatsapp", status, createdAt: CREATED_AT, ...extra };
}

type Handler = (url: URL, init?: RequestInit) => { status: number; body: unknown };

function json(status: number, body: unknown) {
  return { status, body };
}

let roomsByStatus: Record<RoomStatus, Room[]>;
let claimHandler: Handler;
const fetchMock = vi.fn();

beforeEach(() => {
  roomsByStatus = {
    idle: [room("r-idle", "Budi Santoso", "idle")],
    bot: [room("r-bot", "Citra Lestari", "bot")],
    assigned: [room("r-assigned", "Dewi Anggraini", "assigned", { assignedAgent: "Agent Smith" })],
    closed: [room("r-closed", "Eka Putra", "closed")],
  };
  claimHandler = () => json(500, { error: "unexpected claim" });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const { status, body } =
      url.pathname === "/api/rooms"
        ? json(200, roomsByStatus[url.searchParams.get("status") as RoomStatus])
        : /^\/api\/rooms\/[^/]+\/claim$/.test(url.pathname)
          ? claimHandler(url, init)
          : json(404, { error: "no route" });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderList(onSelect = vi.fn()) {
  render(<ChatList selectedRoomId={null} onSelect={onSelect} />);
  return { onSelect, user: userEvent.setup() };
}

function tile(name: string) {
  return screen.getByText(name).closest("li") as HTMLElement;
}

describe("ChatList claiming", () => {
  it("offers Claim on idle and bot rooms only", async () => {
    const { user } = renderList();

    expect(await within(await findTile("Budi Santoso")).findByRole("button", { name: "Claim" })).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: "Bot" }));
    expect(within(await findTile("Citra Lestari")).getByRole("button", { name: "Claim" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Assigned" }));
    expect(within(await findTile("Dewi Anggraini")).queryByRole("button", { name: "Claim" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Closed" }));
    expect(within(await findTile("Eka Putra")).queryByRole("button", { name: "Claim" })).toBeNull();
  });

  it("claims as Agent Demo and lands on the Assigned tab with the room selected", async () => {
    let request: { method?: string; path: string; body: unknown } | undefined;
    claimHandler = (url, init) => {
      request = { method: init?.method, path: url.pathname, body: JSON.parse(String(init?.body)) };
      const claimed = room("r-idle", "Budi Santoso", "assigned", {
        assignedAgent: "Agent Demo",
        claimedAt: "2026-09-30T09:03:00Z",
      });
      roomsByStatus.idle = [];
      roomsByStatus.assigned = [claimed, ...roomsByStatus.assigned];
      return json(200, claimed);
    };
    const { user, onSelect } = renderList();

    await user.click(within(await findTile("Budi Santoso")).getByRole("button", { name: "Claim" }));

    expect(request).toEqual({ method: "POST", path: "/api/rooms/r-idle/claim", body: { agentName: "Agent Demo" } });
    expect(await screen.findByRole("tab", { name: "Assigned" })).toHaveAttribute("aria-selected", "true");
    expect(await within(await findTile("Budi Santoso")).findByText("Assigned to Agent Demo")).toBeInTheDocument();
    expect(within(tile("Dewi Anggraini")).getByText("Assigned to Agent Smith")).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "r-idle", status: "assigned" }));
  });

  it("shows the backend's error on the tile and reloads the tab when the claim fails", async () => {
    claimHandler = () => json(409, { error: "closed rooms cannot be claimed" });
    const { user, onSelect } = renderList();
    await findTile("Budi Santoso");
    const listFetchesBefore = fetchMock.mock.calls.filter(([u]) => String(u).includes("status=idle")).length;

    await user.click(within(tile("Budi Santoso")).getByRole("button", { name: "Claim" }));

    expect(
      await within(await findTile("Budi Santoso")).findByText("closed rooms cannot be claimed"),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("status=idle")).length).toBe(listFetchesBefore + 1);
    expect(screen.getByRole("tab", { name: "Idle" })).toHaveAttribute("aria-selected", "true");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("still shows the error when the reload no longer lists the room", async () => {
    claimHandler = () => {
      roomsByStatus.idle = [];
      return json(409, { error: "room already claimed by Agent Smith" });
    };
    const { user } = renderList();

    await user.click(within(await findTile("Budi Santoso")).getByRole("button", { name: "Claim" }));

    expect(await screen.findByText(/room already claimed by Agent Smith/)).toBeInTheDocument();
  });

  it("does not select the row when Claim is clicked, but clicking the row does", async () => {
    let resolveClaim: (() => void) | undefined;
    const { user, onSelect } = renderList();
    await findTile("Budi Santoso");
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveClaim = () => resolve(new Response(JSON.stringify({ error: "nope" }), { status: 409 }));
        }),
    );

    const claim = within(tile("Budi Santoso")).getByRole("button", { name: "Claim" });
    await user.click(claim);

    expect(claim).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();

    resolveClaim!();
    await screen.findByText("nope");

    await user.click(screen.getByText("Budi Santoso"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "r-idle", status: "idle" }));
  });
});

describe("ChatList SLA breach", () => {
  const created = new Date(CREATED_AT).getTime();

  // Only the interval and the clock are faked, so fetch promises and
  // Testing Library's polling still run on real timers.
  function freezeClockAt(waitMs: number) {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(created + waitMs);
  }

  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const listFetches = () => fetchMock.mock.calls.filter(([u]) => new URL(String(u)).pathname === "/api/rooms").length;

  it("shows the pill on its own once an unassigned room waits past 5:00", async () => {
    freezeClockAt(4 * 60_000 + 59_000);
    renderList();
    await findTile("Budi Santoso");
    const fetchesBefore = listFetches();
    const pill = () => within(tile("Budi Santoso")).queryByText("SLA breached");

    expect(pill()).toBeNull(); // 4:59
    advance(1_000);
    expect(pill()).toBeNull(); // exactly 5:00
    advance(500);
    expect(pill()).toBeNull(); // 5:00.5 is still 300 whole seconds
    advance(500);

    expect(within(tile("Budi Santoso")).getByText("SLA breached")).toBeInTheDocument();
    expect(listFetches()).toBe(fetchesBefore);
  });

  it("shows the pill on bot rooms too", async () => {
    freezeClockAt(10 * 60_000);
    const { user } = renderList();
    await findTile("Budi Santoso");

    await user.click(screen.getByRole("tab", { name: "Bot" }));

    expect(within(await findTile("Citra Lestari")).getByText("SLA breached")).toBeInTheDocument();
  });

  it("never shows the pill on assigned or closed rooms", async () => {
    freezeClockAt(4 * 60_000);
    const { user } = renderList();
    await findTile("Budi Santoso");

    await user.click(screen.getByRole("tab", { name: "Assigned" }));
    await findTile("Dewi Anggraini");
    advance(60 * 60_000);
    expect(within(tile("Dewi Anggraini")).queryByText("SLA breached")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Closed" }));
    expect(within(await findTile("Eka Putra")).queryByText("SLA breached")).toBeNull();
  });
});

async function findTile(name: string) {
  await screen.findByText(name);
  return tile(name);
}
