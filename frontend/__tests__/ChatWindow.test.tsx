import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatWindow from "@/components/ChatWindow";
import { fetchNotes } from "@/lib/api";
import type { Room } from "@/lib/types";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
}));
vi.mock("@/lib/api", () => ({
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
}));

const room: Room = {
  id: "room1",
  name: "Nadia Dewi",
  platform: "whatsapp",
  status: "assigned",
  createdAt: "2026-09-30T08:00:00Z",
};

describe("ChatWindow tabs", () => {
  beforeEach(() => {
    // jsdom does not implement scrollIntoView, which the message list calls.
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(fetchNotes).mockReset().mockResolvedValue([]);
  });

  it("shows Chat and Notes tabs with Chat selected by default", () => {
    render(<ChatWindow room={room} />);

    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
    expect(fetchNotes).not.toHaveBeenCalled();
  });

  it("switches to the notes view when Notes is clicked", async () => {
    const user = userEvent.setup();
    render(<ChatWindow room={room} />);

    await user.click(screen.getByRole("tab", { name: "Notes" }));

    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText(/no notes yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
    expect(fetchNotes).toHaveBeenCalledWith("room1");
  });

  it("switches back to the chat view", async () => {
    const user = userEvent.setup();
    render(<ChatWindow room={room} />);

    await user.click(screen.getByRole("tab", { name: "Notes" }));
    await user.click(screen.getByRole("tab", { name: "Chat" }));

    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add note/i })).not.toBeInTheDocument();
  });
});
