import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatList from "@/components/ChatList";
import { claimRoom, fetchRooms } from "@/lib/api";
import type { Room } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  fetchRooms: vi.fn(),
  createRoom: vi.fn(),
  claimRoom: vi.fn(),
}));

const NOW = new Date("2026-09-30T10:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function room(overrides: Partial<Room> = {}): Room {
  return { id: "r1", name: "Budi Santoso", platform: "whatsapp", status: "idle", createdAt: ago(60_000), ...overrides };
}

function renderList(onSelect = vi.fn()) {
  render(<ChatList selectedRoomId={null} onSelect={onSelect} />);
  return onSelect;
}

describe("ChatList claiming", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    vi.mocked(fetchRooms).mockReset();
    vi.mocked(claimRoom).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("shows a Claim button on unassigned rooms", async () => {
    vi.mocked(fetchRooms).mockResolvedValue([room()]);
    renderList();

    expect(await screen.findByRole("button", { name: "Claim Budi Santoso" })).toBeInTheDocument();
    expect(screen.queryByText("SLA breached")).not.toBeInTheDocument();
  });

  it("shows the SLA breached badge immediately for rooms waiting over 5 minutes", async () => {
    vi.mocked(fetchRooms).mockResolvedValue([room({ createdAt: ago(6 * 60_000) })]);
    renderList();

    expect(await screen.findByText("SLA breached")).toBeInTheDocument();
  });

  it("shows the SLA breached badge live, without refetching, once 5 minutes pass", async () => {
    vi.mocked(fetchRooms).mockResolvedValue([room({ createdAt: ago(4 * 60_000 + 50_000) })]);
    renderList();
    await screen.findByRole("button", { name: "Claim Budi Santoso" });
    expect(screen.queryByText("SLA breached")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(11_000);
    });

    expect(screen.getByText("SLA breached")).toBeInTheDocument();
    expect(fetchRooms).toHaveBeenCalledTimes(1);
  });

  it("claims the room as Agent Demo and removes it from the queue", async () => {
    const claimed = room({ status: "assigned", assignedAgent: "Agent Demo", claimedAt: NOW.toISOString() });
    vi.mocked(fetchRooms).mockResolvedValue([room()]);
    vi.mocked(claimRoom).mockResolvedValue(claimed);
    const onSelect = renderList();

    fireEvent.click(await screen.findByRole("button", { name: "Claim Budi Santoso" }));

    await waitFor(() => expect(screen.queryByText("Budi Santoso")).not.toBeInTheDocument());
    expect(claimRoom).toHaveBeenCalledWith("r1", "Agent Demo");
    expect(onSelect).toHaveBeenCalledWith(claimed);
  });

  it("shows the API error when the claim is rejected", async () => {
    vi.mocked(fetchRooms).mockResolvedValue([room()]);
    vi.mocked(claimRoom).mockRejectedValue(new Error("room is already claimed by another agent"));
    renderList();

    fireEvent.click(await screen.findByRole("button", { name: "Claim Budi Santoso" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("room is already claimed by another agent");
  });

  it("shows the agent name and no Claim button in the Assigned tab", async () => {
    vi.mocked(fetchRooms).mockImplementation(async (status) =>
      status === "assigned"
        ? [room({ status: "assigned", assignedAgent: "Agent Demo", claimedAt: NOW.toISOString(), slaBreached: true, createdAt: ago(20 * 60_000) })]
        : [],
    );
    renderList();

    fireEvent.click(screen.getByRole("tab", { name: "Assigned" }));

    const item = (await screen.findByText("Assigned to Agent Demo")).closest("li")!;
    expect(within(item).getByText("SLA breached")).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: /claim/i })).not.toBeInTheDocument();
    expect(fetchRooms).toHaveBeenLastCalledWith("assigned");
  });

  it("does not offer Claim on closed rooms", async () => {
    vi.mocked(fetchRooms).mockImplementation(async (status) =>
      status === "closed" ? [room({ status: "closed", createdAt: ago(30 * 60_000) })] : [],
    );
    renderList();

    fireEvent.click(screen.getByRole("tab", { name: "Closed" }));

    await screen.findByText("Budi Santoso");
    expect(screen.queryByRole("button", { name: /claim/i })).not.toBeInTheDocument();
    expect(screen.queryByText("SLA breached")).not.toBeInTheDocument();
  });
});
