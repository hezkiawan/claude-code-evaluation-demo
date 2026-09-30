"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createNote, fetchNotes } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { Note } from "@/lib/types";

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
    <li className="rounded-lg bg-panel px-4 py-3 shadow-md">
      <p className="whitespace-pre-wrap break-words text-default">{note.content}</p>
      <time dateTime={note.createdAt} className="mt-1 block text-xs text-muted">
        {dateTime(new Date(note.createdAt))}
      </time>
    </li>
  );
}

function NoteForm({ roomId, onCreated }: { roomId: string; onCreated: (note: Note) => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || saving) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(await createNote(roomId, content));
      setText("");
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
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="rounded bg-primary px-5 py-2 text-white disabled:opacity-50"
        >
          Add note
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  );
}
