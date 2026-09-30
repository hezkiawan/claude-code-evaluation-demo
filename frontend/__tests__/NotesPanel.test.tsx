import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotesPanel from "@/components/NotesPanel";
import { createNote, fetchNotes } from "@/lib/api";
import type { Note } from "@/lib/types";

vi.mock("@/lib/api", () => ({ fetchNotes: vi.fn(), createNote: vi.fn() }));

const note = (id: string, content: string, createdAt: string, isImportant = false): Note => ({
  id,
  content,
  createdAt,
  isImportant,
});

describe("NotesPanel", () => {
  beforeEach(() => {
    vi.mocked(fetchNotes).mockReset();
    vi.mocked(createNote).mockReset();
  });

  it("lists notes newest first and highlights important ones", async () => {
    vi.mocked(fetchNotes).mockResolvedValue([
      note("a", "older note", "2026-09-01T10:00:00Z"),
      note("b", "newer note", "2026-09-02T10:00:00Z", true),
    ]);
    render(<NotesPanel roomId="room1" />);

    const items = await screen.findAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("newer note"),
      expect.stringContaining("older note"),
    ]);
    expect(items[0]).toHaveAttribute("data-important", "true");
    expect(items[0]).toHaveTextContent("Important");
    expect(items[1]).toHaveAttribute("data-important", "false");
    expect(fetchNotes).toHaveBeenCalledWith("room1");
  });

  it("adds a submitted note to the top of the list and clears the input", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchNotes).mockResolvedValue([note("a", "existing", "2026-09-01T10:00:00Z")]);
    vi.mocked(createNote).mockResolvedValue(note("new", "call back tomorrow", "2026-09-03T10:00:00Z", true));
    render(<NotesPanel roomId="room1" />);
    await screen.findByText("existing");

    const input = screen.getByLabelText("Note");
    await user.type(input, "call back tomorrow");
    await user.click(screen.getByLabelText("Important"));
    await user.click(screen.getByRole("button", { name: "Add Note" }));

    expect(createNote).toHaveBeenCalledWith("room1", "call back tomorrow", true);
    await waitFor(() => expect(input).toHaveValue(""));
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("call back tomorrow");
    expect(items).toHaveLength(2);
  });

  it("shows the backend error message when submit fails", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchNotes).mockResolvedValue([]);
    vi.mocked(createNote).mockRejectedValue(new Error("content must be 1 to 500 characters"));
    render(<NotesPanel roomId="room1" />);
    await screen.findByText("No notes yet.");

    await user.type(screen.getByLabelText("Note"), "x");
    await user.click(screen.getByRole("button", { name: "Add Note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("content must be 1 to 500 characters");
    expect(screen.getByLabelText("Note")).toHaveValue("x");
  });
});
