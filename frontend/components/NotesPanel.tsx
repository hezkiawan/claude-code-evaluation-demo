"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createNote, fetchNotes } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { Note } from "@/lib/types";
import { PlusIcon } from "./icons";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// Internal notes are agent-only: they are loaded from the Go API, never from the
// customer-visible messages collection.
export default function NotesPanel({ roomId }: { roomId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    fetchNotes(roomId)
      .then((loaded) => {
        if (!isCancelled) setNotes(loaded);
      })
      .catch((err: unknown) => {
        if (!isCancelled) setLoadError(errorMessage(err, "Failed to load notes"));
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });
    return () => {
      isCancelled = true;
    };
  }, [roomId]);

  const handleCreated = (note: Note) => setNotes((prev) => [note, ...prev]);
  const isEmpty = !isLoading && !loadError && notes.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto bg-raised p-6">
        {isLoading && <p className="text-center text-sm text-muted">Loading notes…</p>}
        {loadError && <p className="text-center text-sm text-danger">{loadError}</p>}
        {isEmpty && <p className="text-center text-sm text-muted">No notes yet. Notes are only visible to agents.</p>}
        <ul aria-label="Notes" className="space-y-3">
          {notes.map((note) => (
            <NoteItem key={note.id} note={note} />
          ))}
        </ul>
      </div>
      <NoteForm roomId={roomId} isDisabled={isLoading} onCreated={handleCreated} />
    </div>
  );
}

function NoteItem({ note }: { note: Note }) {
  const createdAt = new Date(note.createdAt);
  const accent = note.isImportant ? "border-l-4 border-warning" : "";

  return (
    <li data-important={note.isImportant} className={`overflow-hidden rounded-lg bg-panel shadow-md ${accent}`}>
      {note.isImportant && (
        <div className="bg-warning px-4 py-1 text-xs font-medium uppercase tracking-wide text-on-warning">
          Important
        </div>
      )}
      <div className="px-4 py-3">
        <p className="whitespace-pre-wrap break-words text-default">{note.content}</p>
        <time
          dateTime={note.createdAt}
          title={createdAt.toLocaleString()}
          className="mt-1 block text-right text-xs text-muted"
        >
          {relativeTime(createdAt)}
        </time>
      </div>
    </li>
  );
}

type NoteFormProps = {
  roomId: string;
  isDisabled: boolean;
  onCreated: (note: Note) => void;
};

function NoteForm({ roomId, isDisabled, onCreated }: NoteFormProps) {
  const [content, setContent] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = !isDisabled && !isSubmitting && content.trim() !== "";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // Length is validated server-side: the API counts Unicode characters, which
      // an input's maxLength (UTF-16 units) would get wrong for emoji.
      onCreated(await createNote(roomId, content.trim(), isImportant));
      setContent("");
      setIsImportant(false);
    } catch (err) {
      setError(errorMessage(err, "Failed to add note"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-raised bg-panel px-6 py-4">
      <div className="flex items-center gap-3">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add an internal note…"
          aria-label="Note"
          className="min-w-0 flex-1 rounded-md border border-input-border bg-panel px-4 py-2 text-default placeholder:text-muted"
        />
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-default">
          <input
            type="checkbox"
            checked={isImportant}
            onChange={(e) => setIsImportant(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Important
        </label>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center gap-2 rounded bg-primary px-5 py-2 text-white disabled:opacity-50"
        >
          <PlusIcon width={18} height={18} />
          Add note
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
