"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createNote, fetchNotes } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { Note } from "@/lib/types";

// Matches the backend rule: content trimmed like Go's strings.TrimSpace, then
// counted in Unicode code points (so 😀 is 1), not UTF-16 units.
const MAX_NOTE_LENGTH = 500;

// Go's unicode.IsSpace set. Unlike JS trim(), it includes U+0085 and excludes U+FEFF.
const GO_SPACE = "[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]";
const GO_TRIM = new RegExp(`^${GO_SPACE}+|${GO_SPACE}+$`, "g");

function trimNote(text: string): string {
  return text.replace(GO_TRIM, "");
}

function noteLength(text: string): number {
  return [...trimNote(text)].length;
}

// Internal Notes of one Room. Mounted only while the Notes tab is open, so the
// list is fetched fresh every time the tab is opened.
export default function RoomNotes({ roomId }: { roomId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNotes(roomId)
      .then((result) => {
        if (!cancelled) setNotes(result);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load notes");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-raised p-6">
        {loading && <p className="text-center text-sm text-muted">Loading notes…</p>}
        {loadError && <p className="text-center text-sm text-danger">{loadError}</p>}
        {!loading && !loadError && notes.length === 0 && (
          <p className="text-center text-sm text-muted">No internal notes yet</p>
        )}
        <ul className="space-y-3">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </ul>
      </div>

      <NoteForm roomId={roomId} onCreated={(created) => setNotes((prev) => [created, ...prev])} />
    </>
  );
}

function NoteCard({ note }: { note: Note }) {
  return (
    <li className={`rounded-lg bg-panel px-4 py-3 shadow-md ${note.isImportant ? "border-l-4 border-warning" : ""}`}>
      {note.isImportant && <p className="mb-1 text-xs font-medium text-warning">Important</p>}
      <p className="whitespace-pre-wrap break-words text-default">{note.content}</p>
      <time dateTime={note.createdAt} className="mt-1 block text-xs text-muted">
        {dateTime(new Date(note.createdAt))}
      </time>
    </li>
  );
}

function NoteForm({ roomId, onCreated }: { roomId: string; onCreated: (note: Note) => void }) {
  const [text, setText] = useState("");
  const [important, setImportant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const charCount = noteLength(text);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const content = trimNote(text);
    if (!content || saving) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(await createNote(roomId, content, important));
      setText("");
      setImportant(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-t border-raised bg-panel px-6 py-4">
      <div className="flex gap-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add an internal note…"
          aria-label="Internal note"
          className="min-w-0 flex-1 rounded-md border border-input-border bg-panel px-4 py-2 text-default placeholder:text-muted"
        />
        <label className="flex items-center gap-2 self-center text-sm text-default">
          <input
            type="checkbox"
            checked={important}
            onChange={(e) => setImportant(e.target.checked)}
            className="accent-primary"
          />
          Important
        </label>
        <span
          className={`self-center text-sm tabular-nums ${charCount > MAX_NOTE_LENGTH ? "text-danger" : "text-muted"}`}
        >
          {charCount}/{MAX_NOTE_LENGTH}
        </span>
        <button
          type="submit"
          disabled={saving || charCount === 0}
          className="rounded bg-primary px-5 py-2 text-white disabled:opacity-50"
        >
          Add note
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  );
}
