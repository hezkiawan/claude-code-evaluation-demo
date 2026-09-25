"use client";

import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { createNote, fetchNotes } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { Note } from "@/lib/types";
import { StarIcon } from "./icons";

const NOTE_MAX_LENGTH = 500;

// Counts code points so emoji count as one, matching the Go API's rune count.
const charCount = (text: string) => Array.from(text.trim()).length;

export default function NotesPanel({ roomId }: { roomId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchNotes(roomId)
      .then((loaded) => {
        if (cancelled) return;
        // Keep notes added while the list was still loading (they are newer).
        setNotes((local) => [...local, ...loaded.filter((n) => !local.some((l) => l.id === n.id))]);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load notes");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NoteForm roomId={roomId} onCreated={(note) => setNotes((prev) => [note, ...prev])} />

      <div className="flex-1 space-y-3 overflow-y-auto bg-raised p-6">
        {loading && <p className="text-center text-sm text-muted">Loading notes…</p>}
        {!loading && error && (
          <p role="alert" className="text-center text-sm text-danger">
            {error}
          </p>
        )}
        {!loading && !error && notes.length === 0 && (
          <p className="text-center text-sm text-muted">No notes yet for this conversation.</p>
        )}
        {notes.length > 0 && (
          <ul aria-label="Notes" className="space-y-3">
            {notes.map((note) => (
              <NoteItem key={note.id} note={note} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NoteItem({ note }: { note: Note }) {
  return (
    <li
      data-important={note.isImportant}
      className={`overflow-hidden rounded-lg bg-panel shadow-md ${note.isImportant ? "border-l-4 border-warning" : ""}`}
    >
      {note.isImportant && (
        <div className="flex items-center gap-2 bg-warning px-4 py-1 text-sm font-medium text-on-warning">
          <StarIcon width={14} height={14} />
          Important
        </div>
      )}
      <div className="px-4 py-3">
        <p className="whitespace-pre-wrap break-words text-default">{note.content}</p>
        <time dateTime={note.createdAt} className="mt-2 block text-xs text-muted">
          {dateTime(new Date(note.createdAt))}
        </time>
      </div>
    </li>
  );
}

function NoteForm({ roomId, onCreated }: { roomId: string; onCreated: (note: Note) => void }) {
  const [text, setText] = useState("");
  const [important, setImportant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counterId = useId();

  const length = charCount(text);
  const tooLong = length > NOTE_MAX_LENGTH;
  const canSubmit = length > 0 && !tooLong && !saving;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(await createNote(roomId, text.trim(), important));
      setText("");
      setImportant(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  // Enter inserts a newline; Ctrl/Cmd+Enter submits.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form aria-label="Add note" onSubmit={submit} className="space-y-3 border-b border-raised bg-panel px-6 py-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="New note"
        aria-describedby={counterId}
        aria-invalid={tooLong}
        rows={2}
        placeholder="Add an internal note (visible to agents only)…"
        className="block w-full resize-none rounded-md border border-input-border bg-panel px-4 py-2 text-default placeholder:text-muted"
      />
      <div className="flex items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-default">
          <input
            type="checkbox"
            checked={important}
            onChange={(e) => setImportant(e.target.checked)}
            className="h-4 w-4 accent-warning"
          />
          Mark as important
        </label>
        <span id={counterId} className={`ml-auto text-sm ${tooLong ? "text-danger" : "text-muted"}`}>
          {length}/{NOTE_MAX_LENGTH}
        </span>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-primary px-5 py-2 text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add Note"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
