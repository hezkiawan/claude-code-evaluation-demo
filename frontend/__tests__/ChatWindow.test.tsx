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
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ fetchNotes: vi.fn(), createNote: vi.fn() }));

function room(id: string, name: string): Room {
  return { id, name, platform: "whatsapp", status: "closed", createdAt: "2026-09-30T07:00:00.000Z" };
}

beforeEach(() => {
  // jsdom does not implement scrolling.
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(fetchNotes).mockResolvedValue([]);
});

describe("ChatWindow tabs", () => {
  it("opens on the Chat tab with the message composer", () => {
    render(<ChatWindow room={room("r1", "Maya")} />);

    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
  });

  it("shows the room's notes and hides the message composer on the Notes tab", async () => {
    const user = userEvent.setup();
    render(<ChatWindow room={room("r1", "Maya")} />);

    await user.click(screen.getByRole("tab", { name: "Notes" }));

    expect(await screen.findByText("No internal notes yet")).toBeInTheDocument();
    expect(fetchNotes).toHaveBeenCalledWith("r1");
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /internal note/i })).toBeInTheDocument();
  });

  it("goes back to the Chat tab when another room is selected", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ChatWindow room={room("r1", "Maya")} />);
    await user.click(screen.getByRole("tab", { name: "Notes" }));
    await screen.findByText("No internal notes yet");

    rerender(<ChatWindow room={room("r2", "Budi")} />);

    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
  });
});
