import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RoomNotes from "@/components/RoomNotes";
import { createNote, fetchNotes } from "@/lib/api";
import type { Note } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
}));

const fetchNotesMock = vi.mocked(fetchNotes);
const createNoteMock = vi.mocked(createNote);

function note(overrides: Partial<Note>): Note {
  return { id: "n1", content: "a note", createdAt: "2026-09-30T07:05:00.000Z", ...overrides };
}

beforeEach(() => {
  fetchNotesMock.mockReset();
  createNoteMock.mockReset();
});

describe("RoomNotes", () => {
  it("shows loading, then the room's notes in the order returned with their date and time", async () => {
    fetchNotesMock.mockResolvedValue([
      note({ id: "n2", content: "escalated to billing", createdAt: "2026-09-30T07:05:00.000Z" }),
      note({ id: "n1", content: "customer already refunded once", createdAt: "2026-09-28T09:30:00.000Z" }),
    ]);

    render(<RoomNotes roomId="room-1" />);

    expect(screen.getByText(/loading notes/i)).toBeInTheDocument();
    const items = await screen.findAllByRole("listitem");
    expect(fetchNotesMock).toHaveBeenCalledWith("room-1");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("escalated to billing");
    expect(items[1]).toHaveTextContent("customer already refunded once");
    expect(within(items[0]).getByRole("time")).toHaveAttribute("dateTime", "2026-09-30T07:05:00.000Z");
    expect(screen.queryByText(/loading notes/i)).not.toBeInTheDocument();
  });

  it("shows an empty state when the room has no notes", async () => {
    fetchNotesMock.mockResolvedValue([]);

    render(<RoomNotes roomId="room-1" />);

    expect(await screen.findByText("No internal notes yet")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("shows the error when the notes cannot be loaded", async () => {
    fetchNotesMock.mockRejectedValue(new Error("failed to fetch notes"));

    render(<RoomNotes roomId="room-1" />);

    expect(await screen.findByText("failed to fetch notes")).toBeInTheDocument();
    expect(screen.queryByText("No internal notes yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/loading notes/i)).not.toBeInTheDocument();
  });

  it("adds a submitted note to the top of the list and clears the input", async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([note({ id: "n1", content: "older note" })]);
    createNoteMock.mockResolvedValue(
      note({ id: "n2", content: "prefers Bahasa Indonesia", createdAt: "2026-09-30T08:00:00.000Z" }),
    );
    render(<RoomNotes roomId="room-1" />);
    await screen.findByText("older note");

    const input = screen.getByRole("textbox", { name: /internal note/i });
    await user.type(input, "  prefers Bahasa Indonesia  ");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    expect(createNoteMock).toHaveBeenCalledWith("room-1", "prefers Bahasa Indonesia");
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("prefers Bahasa Indonesia");
    expect(items[1]).toHaveTextContent("older note");
    expect(input).toHaveValue("");
  });

  it("disables Add note while the input is empty or whitespace-only", async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([]);
    render(<RoomNotes roomId="room-1" />);
    await screen.findByText("No internal notes yet");

    const button = screen.getByRole("button", { name: "Add note" });
    expect(button).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /internal note/i }), "   ");
    expect(button).toBeDisabled();
  });

  it("shows the backend's message and keeps the text when a submit fails", async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([]);
    createNoteMock.mockRejectedValue(new Error("room not found"));
    render(<RoomNotes roomId="room-1" />);
    await screen.findByText("No internal notes yet");

    const input = screen.getByRole("textbox", { name: /internal note/i });
    await user.type(input, "escalated to billing");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    expect(await screen.findByText("room not found")).toBeInTheDocument();
    expect(input).toHaveValue("escalated to billing");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("disables Add note while the note is being saved", async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([]);
    let resolveCreate: (n: Note) => void = () => {};
    createNoteMock.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));
    render(<RoomNotes roomId="room-1" />);
    await screen.findByText("No internal notes yet");

    await user.type(screen.getByRole("textbox", { name: /internal note/i }), "hello");
    const button = screen.getByRole("button", { name: "Add note" });
    await user.click(button);

    expect(button).toBeDisabled();
    resolveCreate(note({ id: "n9", content: "hello" }));
    expect(await screen.findByRole("listitem")).toHaveTextContent("hello");
  });
});
