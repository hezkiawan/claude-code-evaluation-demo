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
  return { id: "n1", content: "a note", isImportant: false, createdAt: "2026-09-30T07:05:00.000Z", ...overrides };
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

    expect(createNoteMock).toHaveBeenCalledWith("room-1", "prefers Bahasa Indonesia", false);
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

  it("shows a live n/500 counter that counts an emoji as one character", async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([]);
    render(<RoomNotes roomId="room-1" />);
    await screen.findByText("No internal notes yet");

    expect(screen.getByText("0/500")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /internal note/i }), "hi 😀");
    expect(screen.getByText("4/500")).toBeInTheDocument();
  });

  it("does not cap the input and turns the counter danger-colored above 500", async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([]);
    render(<RoomNotes roomId="room-1" />);
    await screen.findByText("No internal notes yet");

    const input = screen.getByRole("textbox", { name: /internal note/i });
    expect(input).not.toHaveAttribute("maxLength");
    await user.click(input);
    await user.paste("😀".repeat(500));
    expect(screen.getByText("500/500")).not.toHaveClass("text-danger");
    await user.type(input, "a");
    expect(input).toHaveValue("😀".repeat(500) + "a");
    expect(screen.getByText("501/500")).toHaveClass("text-danger");
  });

  it("lets an over-limit note be submitted and shows the backend's rejection, keeping the text", async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([]);
    createNoteMock.mockRejectedValue(new Error("content is required (1-500 characters)"));
    render(<RoomNotes roomId="room-1" />);
    await screen.findByText("No internal notes yet");

    const input = screen.getByRole("textbox", { name: /internal note/i });
    const tooLong = "a".repeat(501);
    await user.click(input);
    await user.paste(tooLong);
    await user.click(screen.getByRole("button", { name: "Add note" }));

    expect(createNoteMock).toHaveBeenCalledWith("room-1", tooLong, false);
    expect(await screen.findByText("content is required (1-500 characters)")).toBeInTheDocument();
    expect(input).toHaveValue(tooLong);
  });

  it("trims the same whitespace as the backend when counting", async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([]);
    render(<RoomNotes roomId="room-1" />);
    await screen.findByText("No internal notes yet");

    const input = screen.getByRole("textbox", { name: /internal note/i });
    await user.click(input);
    // The backend trims U+0085 (NEL) but keeps U+FEFF (BOM); JS trim() does the opposite.
    await user.paste("hi 　");
    expect(screen.getByText("2/500")).toBeInTheDocument();
    await user.clear(input);
    await user.paste("﻿hi");
    expect(screen.getByText("3/500")).toBeInTheDocument();
  });

  it("highlights an Important note with a label and banner, and leaves a normal note plain", async () => {
    fetchNotesMock.mockResolvedValue([
      note({ id: "n2", content: "customer threatened chargeback", isImportant: true }),
      note({ id: "n1", content: "prefers Bahasa Indonesia", isImportant: false }),
    ]);

    render(<RoomNotes roomId="room-1" />);

    const [important, normal] = await screen.findAllByRole("listitem");
    expect(within(important).getByText("Important")).toHaveClass("text-warning");
    expect(important).toHaveClass("border-l-4", "border-warning");
    expect(within(normal).queryByText("Important")).not.toBeInTheDocument();
    expect(normal).not.toHaveClass("border-l-4");
    expect(normal).not.toHaveClass("border-warning");
  });

  it("sends the Important flag and unchecks the box after a successful submit", async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([]);
    createNoteMock.mockResolvedValue(note({ id: "n2", content: "escalated to billing", isImportant: true }));
    render(<RoomNotes roomId="room-1" />);
    await screen.findByText("No internal notes yet");

    const checkbox = screen.getByRole("checkbox", { name: "Important" });
    expect(checkbox).not.toBeChecked();
    await user.type(screen.getByRole("textbox", { name: /internal note/i }), "escalated to billing");
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Add note" }));

    expect(createNoteMock).toHaveBeenCalledWith("room-1", "escalated to billing", true);
    const item = await screen.findByRole("listitem");
    expect(within(item).getByText("Important")).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it("keeps the Important box ticked when a submit fails", async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([]);
    createNoteMock.mockRejectedValue(new Error("failed to create note"));
    render(<RoomNotes roomId="room-1" />);
    await screen.findByText("No internal notes yet");

    const checkbox = screen.getByRole("checkbox", { name: "Important" });
    await user.type(screen.getByRole("textbox", { name: /internal note/i }), "hi");
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Add note" }));

    expect(await screen.findByText("failed to create note")).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });
});
