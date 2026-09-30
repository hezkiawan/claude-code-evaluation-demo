import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatList from "@/components/ChatList";
import { claimRoom, fetchRooms } from "@/lib/api";
import { CURRENT_AGENT, SLA_WAIT_LIMIT_MS, isClaimable, isSlaBreached } from "@/lib/claim";
import type { Room } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  fetchRooms: vi.fn(),
  claimRoom: vi.fn(),
  createRoom: vi.fn(),
}));

const NOW = new Date("2026-09-30T10:00:00Z");

function room(overrides: Partial<Room> = {}): Room {
  return { id: "r1", name: "Maya Erin", platform: "whatsapp", status: "idle", createdAt: NOW.toISOString(), ...overrides };
}

describe("claim helpers", () => {
  it("only unassigned, open rooms are claimable", () => {
    expect(isClaimable(room({ status: "idle" }))).toBe(true);
    expect(isClaimable(room({ status: "bot" }))).toBe(true);
    expect(isClaimable(room({ status: "closed" }))).toBe(false);
    expect(isClaimable(room({ status: "assigned", assignedAgent: "X" }))).toBe(false);
  });

  it("breaches only after waiting more than 5 minutes", () => {
    const r = room();
    expect(isSlaBreached(r, new Date(NOW.getTime() + SLA_WAIT_LIMIT_MS))).toBe(false);
    expect(isSlaBreached(r, new Date(NOW.getTime() + SLA_WAIT_LIMIT_MS + 1000))).toBe(true);
  });

  it("uses the recorded breach for claimed rooms", () => {
    const later = new Date(NOW.getTime() + 60 * SLA_WAIT_LIMIT_MS);
    expect(isSlaBreached(room({ status: "assigned", assignedAgent: "X", slaBreached: false }), later)).toBe(false);
    expect(isSlaBreached(room({ status: "assigned", assignedAgent: "X", slaBreached: true }), NOW)).toBe(true);
  });
});

describe("ChatList claiming", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(fetchRooms).mockReset();
    vi.mocked(claimRoom).mockReset();
  });

  it("shows the SLA badge live once the wait passes 5 minutes", async () => {
    vi.mocked(fetchRooms).mockResolvedValue([room({ createdAt: new Date(NOW.getTime() - SLA_WAIT_LIMIT_MS + 2000).toISOString() })]);
    render(<ChatList selectedRoomId={null} onSelect={() => {}} />);
    await act(async () => {});

    expect(screen.getByRole("button", { name: "Claim Maya Erin" })).toBeInTheDocument();
    expect(screen.queryByText("SLA breached")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("SLA breached")).toBeInTheDocument();
  });

  it("claims as the current agent and moves to the Assigned tab", async () => {
    const claimed = room({ status: "assigned", assignedAgent: CURRENT_AGENT, slaBreached: false });
    vi.mocked(fetchRooms).mockImplementation(async (s) => (s === "assigned" ? [claimed] : [room()]));
    vi.mocked(claimRoom).mockResolvedValue(claimed);
    const onSelect = vi.fn();
    render(<ChatList selectedRoomId={null} onSelect={onSelect} />);
    await act(async () => {});

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Claim Maya Erin" }));
    });

    expect(claimRoom).toHaveBeenCalledWith("r1", "Agent Demo");
    expect(onSelect).toHaveBeenCalledWith(claimed);
    expect(screen.getByRole("tab", { name: "Assigned" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Assigned to Agent Demo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim/ })).not.toBeInTheDocument();
  });

  it("reports a failed claim and refreshes the list", async () => {
    vi.mocked(fetchRooms).mockResolvedValue([room()]);
    vi.mocked(claimRoom).mockRejectedValue(new Error("room is already claimed"));
    render(<ChatList selectedRoomId={null} onSelect={() => {}} />);
    await act(async () => {});

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Claim Maya Erin" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("room is already claimed");
    expect(fetchRooms).toHaveBeenCalledTimes(2);
  });
});
