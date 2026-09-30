"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createNote, fetchNotes } from "@/lib/api";
import type { Note } from "@/lib/types";

const MAX_NOTE_LENGTH = 500;

// Matches the backend: length in Unicode code points, so an emoji counts as 1.
const charCount = (s: string) => Array.from(s).length;

const newestFirst = (a: Note, b: Note) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

export default function NotesPanel({ roomId }: { roomId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchNotes(roomId)
      .then((data) => !cancelled && setNotes([...data].sort(newestFirst)))
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Failed to load notes"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const addNote = (note: Note) => setNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)].sort(newestFirst));

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto bg-raised p-6" aria-label="Internal notes">
        <p className="text-center text-xs text-muted">Internal notes are only visible to agents.</p>
        {loading && <p className="text-center text-sm text-muted">Loading notes…</p>}
        {loadError && <p className="text-center text-sm text-danger">{loadError}</p>}
        {!loading && !loadError && notes.length === 0 && (
          <p className="text-center text-sm text-muted">No notes yet.</p>
        )}
        <ul className="space-y-3">
          {notes.map((note) => (
            <NoteItem key={note.id} note={note} />
          ))}
        </ul>
      </div>
      <NoteForm roomId={roomId} onCreated={addNote} />
    </>
  );
}

function NoteItem({ note }: { note: Note }) {
  const created = new Date(note.createdAt);
  return (
    <li
      data-important={note.isImportant}
      className={`overflow-hidden rounded-lg shadow-md ${
        note.isImportant ? "border-l-4 border-warning bg-warning-soft" : "bg-panel"
      }`}
    >
      {note.isImportant && (
        <div className="bg-warning px-4 py-1 text-xs font-medium uppercase tracking-wide text-page">Important</div>
      )}
      <div className="px-4 py-3">
        <p className="whitespace-pre-wrap break-words text-default">{note.content}</p>
        {!Number.isNaN(created.getTime()) && (
          <time dateTime={note.createdAt} className="mt-1 block text-right text-xs text-muted">
            {created.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
          </time>
        )}
      </div>
    </li>
  );
}

function NoteForm({ roomId, onCreated }: { roomId: string; onCreated: (note: Note) => void }) {
  const [content, setContent] = useState("");
  const [important, setImportant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = charCount(content.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const note = await createNote(roomId, content, important);
      onCreated(note);
      setContent("");
      setImportant(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-t border-raised bg-panel px-6 py-4">
      <div className="flex items-center gap-3">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add an internal note…"
          aria-label="Note"
          className="min-w-0 flex-1 rounded-md border border-input-border bg-panel px-4 py-2 text-default placeholder:text-muted"
        />
        <label className="flex cursor-pointer select-none items-center gap-2 text-default">
          <input
            type="checkbox"
            checked={important}
            onChange={(e) => setImportant(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          Important
        </label>
        <button
          type="submit"
          disabled={saving || length === 0}
          className="rounded bg-primary px-5 py-2 text-white disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add Note"}
        </button>
      </div>
      <div className="mt-2 flex items-start justify-between gap-4 text-sm">
        <p role={error ? "alert" : undefined} className="text-danger">
          {error}
        </p>
        <span className={`shrink-0 ${length > MAX_NOTE_LENGTH ? "text-danger" : "text-muted"}`}>
          {length}/{MAX_NOTE_LENGTH}
        </span>
      </div>
    </form>
  );
}
