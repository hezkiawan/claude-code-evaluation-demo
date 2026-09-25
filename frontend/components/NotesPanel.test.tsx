import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNote, fetchNotes } from "@/lib/api";
import type { Note } from "@/lib/types";
import NotesPanel from "./NotesPanel";

vi.mock("@/lib/api", () => ({ fetchNotes: vi.fn(), createNote: vi.fn() }));
const mockFetchNotes = vi.mocked(fetchNotes);
const mockCreateNote = vi.mocked(createNote);

const makeNote = (overrides: Partial<Note>): Note => ({
  id: "n1",
  content: "Customer prefers email",
  isImportant: false,
  createdAt: "2026-09-24T10:00:00.000Z",
  ...overrides,
});

const vip = makeNote({ id: "n-vip", content: "VIP customer, escalate fast", isImportant: true });
const plain = makeNote({ id: "n-plain", content: "Asked about invoice #123" });

const noteItem = (text: string) => screen.getByText(text).closest("li") as HTMLElement;

function renderPanel(roomId = "r1") {
  const user = userEvent.setup();
  render(<NotesPanel roomId={roomId} />);
  return { user };
}

beforeEach(() => {
  mockFetchNotes.mockReset();
  mockCreateNote.mockReset();
});

describe("NotesPanel: list", () => {
  it("loads and renders the active room's notes in server order", async () => {
    mockFetchNotes.mockResolvedValue([vip, plain]);
    renderPanel("room-42");

    expect(screen.getByText("Loading notes…")).toBeInTheDocument();
    const items = await screen.findAllByRole("listitem");
    expect(mockFetchNotes).toHaveBeenCalledWith("room-42");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("VIP customer, escalate fast"),
      expect.stringContaining("Asked about invoice #123"),
    ]);
  });

  it("highlights important notes with an Important banner", async () => {
    mockFetchNotes.mockResolvedValue([vip, plain]);
    renderPanel();

    await screen.findByText(vip.content);
    expect(within(noteItem(vip.content)).getByText("Important")).toBeInTheDocument();
    expect(noteItem(vip.content)).toHaveAttribute("data-important", "true");
    expect(within(noteItem(plain.content)).queryByText("Important")).not.toBeInTheDocument();
    expect(noteItem(plain.content)).toHaveAttribute("data-important", "false");
  });

  it("shows an empty state when the room has no notes", async () => {
    mockFetchNotes.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText("No notes yet for this conversation.")).toBeInTheDocument();
  });

  it("shows the server error when loading fails", async () => {
    mockFetchNotes.mockRejectedValue(new Error("room not found"));
    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent("room not found");
  });

  it("preserves line breaks in note content", async () => {
    mockFetchNotes.mockResolvedValue([makeNote({ content: "line one\nline two" })]);
    renderPanel();

    const text = await screen.findByText(/line one/);
    expect(text).toHaveClass("whitespace-pre-wrap");
  });
});

describe("NotesPanel: add note form", () => {
  it("submits a trimmed note with the important flag and shows it first", async () => {
    mockFetchNotes.mockResolvedValue([plain]);
    const created = makeNote({ id: "n-new", content: "Call back at 3pm", isImportant: true });
    mockCreateNote.mockResolvedValue(created);
    const { user } = renderPanel("r7");
    await screen.findByText(plain.content);

    await user.type(screen.getByRole("textbox", { name: "New note" }), "  Call back at 3pm  ");
    await user.click(screen.getByRole("checkbox", { name: "Mark as important" }));
    await user.click(screen.getByRole("button", { name: "Add Note" }));

    expect(mockCreateNote).toHaveBeenCalledWith("r7", "Call back at 3pm", true);
    await waitFor(() => expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Call back at 3pm"));
    expect(noteItem("Call back at 3pm")).toHaveAttribute("data-important", "true");
    expect(screen.getByRole("textbox", { name: "New note" })).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Mark as important" })).not.toBeChecked();
  });

  it("replaces the empty state once the first note is added", async () => {
    mockFetchNotes.mockResolvedValue([]);
    mockCreateNote.mockResolvedValue(plain);
    const { user } = renderPanel();
    await screen.findByText("No notes yet for this conversation.");

    await user.type(screen.getByRole("textbox", { name: "New note" }), plain.content);
    await user.click(screen.getByRole("button", { name: "Add Note" }));

    expect(await screen.findByText(plain.content)).toBeInTheDocument();
    expect(screen.queryByText("No notes yet for this conversation.")).not.toBeInTheDocument();
  });

  it("inserts a newline on Enter and submits on Ctrl+Enter", async () => {
    mockFetchNotes.mockResolvedValue([]);
    mockCreateNote.mockResolvedValue(plain);
    const { user } = renderPanel("r1");

    await user.type(screen.getByRole("textbox", { name: "New note" }), "one{Enter}two");
    expect(mockCreateNote).not.toHaveBeenCalled();
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(mockCreateNote).toHaveBeenCalledWith("r1", "one\ntwo", false);
  });

  it("disables submit for blank input", async () => {
    mockFetchNotes.mockResolvedValue([]);
    const { user } = renderPanel();

    const submit = screen.getByRole("button", { name: "Add Note" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "New note" }), "   ");
    expect(submit).toBeDisabled();
  });

  it("shows a character counter and blocks notes over 500 characters", async () => {
    mockFetchNotes.mockResolvedValue([]);
    const { user } = renderPanel();
    const input = screen.getByRole("textbox", { name: "New note" });

    await user.click(input);
    await user.paste("a".repeat(500));
    expect(screen.getByText("500/500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Note" })).toBeEnabled();

    await user.type(input, "b");
    expect(screen.getByText("501/500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Note" })).toBeDisabled();
  });

  it("counts emoji as one character, matching the server", async () => {
    mockFetchNotes.mockResolvedValue([]);
    const { user } = renderPanel();

    await user.click(screen.getByRole("textbox", { name: "New note" }));
    await user.paste("😀".repeat(500));

    expect(screen.getByText("500/500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Note" })).toBeEnabled();
  });

  it("disables the button while saving", async () => {
    mockFetchNotes.mockResolvedValue([]);
    mockCreateNote.mockReturnValue(new Promise(() => {}));
    const { user } = renderPanel();

    await user.type(screen.getByRole("textbox", { name: "New note" }), "hi");
    await user.click(screen.getByRole("button", { name: "Add Note" }));

    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
  });

  it("keeps the draft and shows the reason when saving fails", async () => {
    mockFetchNotes.mockResolvedValue([]);
    mockCreateNote.mockRejectedValue(new Error("content must be at most 500 characters"));
    const { user } = renderPanel();

    await user.type(screen.getByRole("textbox", { name: "New note" }), "draft");
    await user.click(screen.getByRole("button", { name: "Add Note" }));

    const form = screen.getByRole("form", { name: "Add note" });
    expect(await within(form).findByRole("alert")).toHaveTextContent("content must be at most 500 characters");
    expect(screen.getByRole("textbox", { name: "New note" })).toHaveValue("draft");
  });
});
