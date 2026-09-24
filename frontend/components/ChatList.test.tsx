import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignRoom, fetchRooms } from "@/lib/api";
import type { Room, RoomStatus } from "@/lib/types";
import ChatList from "./ChatList";

vi.mock("@/lib/api", () => ({ fetchRooms: vi.fn(), createRoom: vi.fn(), assignRoom: vi.fn() }));
const mockFetchRooms = vi.mocked(fetchRooms);
const mockAssignRoom = vi.mocked(assignRoom);

const NOW = new Date("2026-09-24T10:10:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const makeRoom = (overrides: Partial<Room>): Room => ({
  id: "r1",
  name: "Nadia",
  platform: "whatsapp",
  status: "idle",
  createdAt: minutesAgo(1),
  slaBreached: false,
  expired: false,
  ...overrides,
});

const fresh = makeRoom({ id: "r-fresh", name: "Fresh Fiona", createdAt: minutesAgo(1) });
const stale = makeRoom({ id: "r-stale", name: "Stale Sam", createdAt: minutesAgo(6) });

function serveRooms(byStatus: Partial<Record<RoomStatus, Room[]>>) {
  mockFetchRooms.mockImplementation(async (status) => byStatus[status] ?? []);
}

const tileOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

function renderList(selectedRoomId: string | null = null) {
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(<ChatList selectedRoomId={selectedRoomId} onSelect={onSelect} />);
  return { onSelect, user };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW);
  mockFetchRooms.mockReset();
  mockAssignRoom.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("ChatList: Assign button", () => {
  it("shows an Assign button on each waiting chat", async () => {
    serveRooms({ idle: [fresh, stale] });
    renderList();

    expect(await screen.findByRole("button", { name: "Assign Fresh Fiona" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign Stale Sam" })).toBeInTheDocument();
  });

  it("is not nested inside the tile's select button", async () => {
    serveRooms({ idle: [fresh] });
    renderList();

    const assign = await screen.findByRole("button", { name: "Assign Fresh Fiona" });
    expect(assign.parentElement?.closest("button")).toBeNull();
  });

  it("moves the chat out of the Idle list once assigned, without selecting it", async () => {
    serveRooms({ idle: [fresh, stale] });
    mockAssignRoom.mockResolvedValue({ ...fresh, status: "assigned", assignedAt: NOW.toISOString() });
    const { user, onSelect } = renderList();

    await user.click(await screen.findByRole("button", { name: "Assign Fresh Fiona" }));

    expect(mockAssignRoom).toHaveBeenCalledWith("r-fresh");
    await waitFor(() => expect(screen.queryByText("Fresh Fiona")).not.toBeInTheDocument());
    expect(screen.getByText("Stale Sam")).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("disables the button while the request is in flight", async () => {
    serveRooms({ idle: [fresh] });
    mockAssignRoom.mockReturnValue(new Promise(() => {}));
    const { user } = renderList();

    const assign = await screen.findByRole("button", { name: "Assign Fresh Fiona" });
    await user.click(assign);

    expect(assign).toBeDisabled();
  });

  it("keeps the chat and shows the reason when assignment fails", async () => {
    serveRooms({ idle: [fresh] });
    mockAssignRoom.mockRejectedValue(new Error("room is already assigned"));
    const { user } = renderList();

    await user.click(await screen.findByRole("button", { name: "Assign Fresh Fiona" }));

    expect(await within(tileOf("Fresh Fiona")).findByRole("alert")).toHaveTextContent("room is already assigned");
    expect(screen.getByRole("button", { name: "Assign Fresh Fiona" })).toBeEnabled();
  });

  it("updates the open conversation when the selected chat is assigned", async () => {
    const updated: Room = { ...fresh, status: "assigned", assignedAt: NOW.toISOString() };
    serveRooms({ idle: [fresh] });
    mockAssignRoom.mockResolvedValue(updated);
    const { user, onSelect } = renderList(fresh.id);

    await user.click(await screen.findByRole("button", { name: "Assign Fresh Fiona" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(updated));
  });
});

describe("ChatList: Assigned tab", () => {
  it("lists assigned chats without Assign buttons or Expired badges", async () => {
    const assigned = makeRoom({ id: "r-a", name: "Andi", status: "assigned", createdAt: minutesAgo(30), slaBreached: true });
    serveRooms({ idle: [], assigned: [assigned] });
    const { user } = renderList();

    await user.click(screen.getByRole("tab", { name: "Assigned" }));

    expect(await screen.findByText("Andi")).toBeInTheDocument();
    expect(mockFetchRooms).toHaveBeenLastCalledWith("assigned");
    expect(screen.queryByRole("button", { name: /^Assign / })).not.toBeInTheDocument();
    expect(screen.queryByText("Expired")).not.toBeInTheDocument();
  });

  it("shows a chat assigned from the Idle tab under Assigned", async () => {
    const updated: Room = { ...fresh, status: "assigned", assignedAt: NOW.toISOString() };
    serveRooms({ idle: [fresh] });
    mockAssignRoom.mockResolvedValue(updated);
    const { user } = renderList();

    await user.click(await screen.findByRole("button", { name: "Assign Fresh Fiona" }));
    await waitFor(() => expect(screen.queryByText("Fresh Fiona")).not.toBeInTheDocument());

    serveRooms({ idle: [], assigned: [updated] });
    await user.click(screen.getByRole("tab", { name: "Assigned" }));

    expect(await screen.findByText("Fresh Fiona")).toBeInTheDocument();
  });
});

describe("ChatList: Expired badge", () => {
  it("marks only chats waiting more than 5 minutes", async () => {
    serveRooms({ idle: [fresh, stale] });
    renderList();

    await screen.findByText("Stale Sam");
    expect(within(tileOf("Stale Sam")).getByText("Expired")).toHaveClass("bg-danger");
    expect(within(tileOf("Fresh Fiona")).queryByText("Expired")).not.toBeInTheDocument();
  });

  it("still allows assigning an expired chat", async () => {
    serveRooms({ idle: [stale] });
    renderList();

    expect(await screen.findByRole("button", { name: "Assign Stale Sam" })).toBeEnabled();
  });

  it("appears within 15 seconds of the SLA passing, without a refetch", async () => {
    const almost = makeRoom({ id: "r-almost", name: "Almost Ari", createdAt: new Date(NOW.getTime() - 5 * 60_000 + 5_000).toISOString() });
    serveRooms({ idle: [almost] });
    renderList();

    await screen.findByText("Almost Ari");
    expect(within(tileOf("Almost Ari")).queryByText("Expired")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(15_000));

    expect(within(tileOf("Almost Ari")).getByText("Expired")).toBeInTheDocument();
    expect(mockFetchRooms).toHaveBeenCalledTimes(1);
  });
});
