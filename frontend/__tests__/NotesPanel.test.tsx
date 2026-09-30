import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotesPanel from "@/components/NotesPanel";
import { createNote, fetchNotes } from "@/lib/api";
import type { Note } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  fetchNotes: vi.fn(),
  createNote: vi.fn(),
}));

const fetchNotesMock = vi.mocked(fetchNotes);
const createNoteMock = vi.mocked(createNote);

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "n1",
    content: "Customer prefers email",
    isImportant: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function renderLoaded(notes: Note[] = []) {
  fetchNotesMock.mockResolvedValue(notes);
  const user = userEvent.setup();
  render(<NotesPanel roomId="room1" />);
  await waitFor(() => expect(screen.queryByText(/loading notes/i)).not.toBeInTheDocument());
  return user;
}

function noteItems() {
  return within(screen.getByRole("list", { name: /notes/i })).queryAllByRole("listitem");
}

describe("NotesPanel", () => {
  beforeEach(() => {
    fetchNotesMock.mockReset();
    createNoteMock.mockReset();
  });

  it("loads notes for the given room", async () => {
    await renderLoaded([makeNote()]);

    expect(fetchNotesMock).toHaveBeenCalledWith("room1");
    expect(screen.getByText("Customer prefers email")).toBeInTheDocument();
  });

  it("shows notes in the order the API returns them (newest first)", async () => {
    await renderLoaded([
      makeNote({ id: "n2", content: "newer note" }),
      makeNote({ id: "n1", content: "older note" }),
    ]);

    const items = noteItems();
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("newer note");
    expect(items[1]).toHaveTextContent("older note");
  });

  it("shows each note's time", async () => {
    const createdAt = "2026-09-30T08:15:00Z";
    await renderLoaded([makeNote({ createdAt })]);

    const time = within(noteItems()[0]).getByRole("time");
    expect(time).toHaveAttribute("dateTime", createdAt);
    expect(time).not.toBeEmptyDOMElement();
  });

  it("highlights important notes with an Important banner", async () => {
    await renderLoaded([
      makeNote({ id: "n2", content: "Escalated to manager", isImportant: true }),
      makeNote({ id: "n1", content: "Routine note", isImportant: false }),
    ]);

    const [important, normal] = noteItems();
    expect(within(important).getByText("Important")).toBeInTheDocument();
    expect(important).toHaveAttribute("data-important", "true");
    expect(within(normal).queryByText("Important")).not.toBeInTheDocument();
    expect(normal).toHaveAttribute("data-important", "false");
  });

  it("shows an empty state when the room has no notes", async () => {
    await renderLoaded([]);

    expect(screen.getByText(/no notes yet/i)).toBeInTheDocument();
  });

  it("shows the error when loading notes fails", async () => {
    fetchNotesMock.mockRejectedValue(new Error("room not found"));

    render(<NotesPanel roomId="room1" />);

    expect(await screen.findByText("room not found")).toBeInTheDocument();
  });

  it("disables submit while the input is blank", async () => {
    const user = await renderLoaded();

    const submit = screen.getByRole("button", { name: /add note/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /note/i }), "   ");
    expect(submit).toBeDisabled();
  });

  it("adds a submitted note to the top of the list and clears the form", async () => {
    const user = await renderLoaded([makeNote({ id: "old", content: "older note" })]);
    createNoteMock.mockResolvedValue(makeNote({ id: "new", content: "Call back at 5pm", isImportant: true }));

    await user.type(screen.getByRole("textbox", { name: /note/i }), "Call back at 5pm");
    await user.click(screen.getByRole("checkbox", { name: /important/i }));
    await user.click(screen.getByRole("button", { name: /add note/i }));

    await waitFor(() => expect(noteItems()).toHaveLength(2));
    expect(createNoteMock).toHaveBeenCalledWith("room1", "Call back at 5pm", true);
    expect(noteItems()[0]).toHaveTextContent("Call back at 5pm");
    expect(noteItems()[0]).toHaveAttribute("data-important", "true");
    expect(screen.getByRole("textbox", { name: /note/i })).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /important/i })).not.toBeChecked();
    expect(fetchNotesMock).toHaveBeenCalledTimes(1); // no reload
  });

  it("submits isImportant=false when the checkbox is left unchecked", async () => {
    const user = await renderLoaded();
    createNoteMock.mockResolvedValue(makeNote());

    await user.type(screen.getByRole("textbox", { name: /note/i }), "plain{Enter}");

    await waitFor(() => expect(createNoteMock).toHaveBeenCalledWith("room1", "plain", false));
  });

  it("replaces the empty state once the first note is added", async () => {
    const user = await renderLoaded([]);
    createNoteMock.mockResolvedValue(makeNote({ content: "first!" }));

    await user.type(screen.getByRole("textbox", { name: /note/i }), "first!");
    await user.click(screen.getByRole("button", { name: /add note/i }));

    expect(await screen.findByText("first!")).toBeInTheDocument();
    expect(screen.queryByText(/no notes yet/i)).not.toBeInTheDocument();
  });

  it("shows the backend error message and keeps the input when submit fails", async () => {
    const user = await renderLoaded();
    createNoteMock.mockRejectedValue(new Error("content must be 1-500 characters"));

    await user.type(screen.getByRole("textbox", { name: /note/i }), "too long");
    await user.click(screen.getByRole("button", { name: /add note/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("content must be 1-500 characters");
    expect(screen.getByRole("textbox", { name: /note/i })).toHaveValue("too long");
    expect(noteItems()).toHaveLength(0);
  });

  it("clears a previous submit error after a successful submit", async () => {
    const user = await renderLoaded();
    createNoteMock.mockRejectedValueOnce(new Error("failed to create note"));
    createNoteMock.mockResolvedValueOnce(makeNote({ content: "retry ok" }));
    const input = screen.getByRole("textbox", { name: /note/i });

    await user.type(input, "retry ok");
    await user.click(screen.getByRole("button", { name: /add note/i }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: /add note/i }));

    await screen.findByText("retry ok", { selector: "p" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
