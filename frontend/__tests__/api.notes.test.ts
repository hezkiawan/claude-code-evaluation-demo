import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNote, fetchNotes } from "@/lib/api";
import type { Note } from "@/lib/types";

const note: Note = { id: "n1", content: "VIP customer", isImportant: true, createdAt: "2026-09-30T10:00:00Z" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("notes API client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchNotes GETs the room's notes", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [note]));

    const notes = await fetchNotes("room1");

    expect(notes).toEqual([note]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/api/rooms/room1/notes");
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("URL-encodes the room id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await fetchNotes("a/b c");

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8080/api/rooms/a%2Fb%20c/notes");
  });

  it("createNote POSTs content and isImportant as JSON", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, note));

    const created = await createNote("room1", "VIP customer", true);

    expect(created).toEqual(note);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/api/rooms/room1/notes");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ content: "VIP customer", isImportant: true });
  });

  it("surfaces the backend error message on failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: "content must be 1-500 characters" }));

    await expect(createNote("room1", "", false)).rejects.toThrow("content must be 1-500 characters");
  });
});
