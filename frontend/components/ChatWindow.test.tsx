import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNotes } from "@/lib/api";
import type { Room } from "@/lib/types";
import ChatWindow from "./ChatWindow";

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
const mockFetchNotes = vi.mocked(fetchNotes);

const room: Room = {
  id: "r1",
  name: "Nadia",
  platform: "whatsapp",
  status: "assigned",
  createdAt: "2026-09-24T10:00:00.000Z",
  slaBreached: false,
  expired: false,
};

// jsdom has no layout, so it doesn't implement scrollIntoView (used for chat auto-scroll).
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  mockFetchNotes.mockReset();
  mockFetchNotes.mockResolvedValue([
    { id: "n1", content: "VIP customer", isImportant: true, createdAt: "2026-09-24T10:00:00.000Z" },
  ]);
});

describe("ChatWindow: Chat / Notes tabs", () => {
  it("opens on the Chat tab without fetching notes", () => {
    render(<ChatWindow room={room} />);

    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("textbox", { name: "Message" })).toBeVisible();
    expect(mockFetchNotes).not.toHaveBeenCalled();
  });

  it("switches to the active room's notes", async () => {
    const user = userEvent.setup();
    render(<ChatWindow room={room} />);

    await user.click(screen.getByRole("tab", { name: "Notes" }));

    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("VIP customer")).toBeInTheDocument();
    expect(mockFetchNotes).toHaveBeenCalledWith("r1");
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
  });

  it("keeps an unsent chat draft when peeking at notes", async () => {
    const user = userEvent.setup();
    render(<ChatWindow room={room} />);

    await user.type(screen.getByRole("textbox", { name: "Message" }), "half-typed reply");
    await user.click(screen.getByRole("tab", { name: "Notes" }));
    await user.click(screen.getByRole("tab", { name: "Chat" }));

    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("half-typed reply");
  });

  it("resets to the Chat tab when a different room is opened", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ChatWindow room={room} />);
    await user.click(screen.getByRole("tab", { name: "Notes" }));

    rerender(<ChatWindow room={{ ...room, id: "r2", name: "Budi" }} />);

    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
  });
});
