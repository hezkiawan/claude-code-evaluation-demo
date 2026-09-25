"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createNote, fetchNotes } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { MAX_NOTE_LENGTH, type Note } from "@/lib/types";
import { PlusIcon, StarIcon } from "./icons";

export default function NotesPanel({ roomId }: { roomId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNotes(roomId).then(
      (list) => !cancelled && setNotes(list),
      (err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load notes"),
    );
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NoteForm roomId={roomId} onCreated={(note) => setNotes((prev) => [note, ...(prev ?? [])])} />

      <div className="flex-1 space-y-3 overflow-y-auto bg-raised p-6">
        {error && <p className="text-center text-sm text-danger">{error}</p>}
        {!error && notes === null && <p className="text-center text-sm text-muted">Loading notes…</p>}
        {notes?.length === 0 && (
          <p className="text-center text-sm text-muted">No notes yet. Notes are only visible to agents.</p>
        )}
        {notes?.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: Note }) {
  const created = new Date(note.createdAt);
  return (
    <article className="overflow-hidden rounded-lg bg-panel shadow-md">
      {note.isImportant && (
        <div className="flex items-center gap-2 bg-warning px-4 py-1 text-sm font-medium text-on-warning">
          <StarIcon width={16} height={16} />
          Important
        </div>
      )}
      <p className="whitespace-pre-wrap break-words px-4 pt-3 text-default">{note.content}</p>
      <time
        dateTime={note.createdAt}
        title={created.toLocaleString()}
        className="block px-4 pb-3 pt-1 text-xs text-muted"
      >
        {relativeTime(created)}
      </time>
    </article>
  );
}

function NoteForm({ roomId, onCreated }: { roomId: string; onCreated: (note: Note) => void }) {
  const [content, setContent] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = content.trim();
  // Count code points to match the backend's character limit.
  const length = [...body].length;
  const tooLong = length > MAX_NOTE_LENGTH;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body || tooLong) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(await createNote(roomId, body, isImportant));
      setContent("");
      setIsImportant(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-b border-raised bg-panel px-6 py-4">
      <div className="flex gap-3">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add an internal note…"
          aria-label="Note"
          className="min-w-0 flex-1 rounded-md border border-input-border bg-panel px-4 py-2 text-default placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={saving || !body || tooLong}
          className="flex items-center gap-2 rounded bg-primary px-5 py-2 text-white disabled:opacity-50"
        >
          <PlusIcon width={18} height={18} />
          Add note
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-muted">
          <input
            type="checkbox"
            checked={isImportant}
            onChange={(e) => setIsImportant(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-warning)]"
          />
          Mark as important
        </label>
        <span className={tooLong ? "text-danger" : "text-muted"}>
          {length}/{MAX_NOTE_LENGTH}
        </span>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  );
}
