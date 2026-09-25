"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { clockTime } from "@/lib/format";
import type { Message, MessageDirection, Room } from "@/lib/types";
import Avatar from "./Avatar";
import NotesPanel from "./NotesPanel";
import PlatformTag from "./PlatformTag";
import Tabs from "./Tabs";
import { ChatIcon, SendIcon } from "./icons";

export default function ChatWindow({ room }: { room: Room | null }) {
  if (!room) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-3 bg-raised text-muted">
        <ChatIcon width={40} height={40} />
        <p>Select a conversation to start chatting</p>
      </section>
    );
  }
  // Keyed so message state resets cleanly when switching rooms.
  return <RoomChat key={room.id} room={room} />;
}

const ROOM_VIEWS = [
  { value: "chat", label: "Chat" },
  { value: "notes", label: "Notes" },
] as const;
type RoomView = (typeof ROOM_VIEWS)[number]["value"];

function RoomChat({ room }: { room: Room }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<RoomView>("chat");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, "rooms", room.id, "messages"), orderBy("createdAt", "asc"));
    return onSnapshot(
      q,
      (snap) => {
        setError(null);
        setMessages(
          snap.docs.map((d) => {
            // "estimate" gives pending server timestamps a local value instead of null.
            const data = d.data({ serverTimestamps: "estimate" });
            return {
              id: d.id,
              text: String(data.text ?? ""),
              direction: (data.direction === "outbound" ? "outbound" : "inbound") as MessageDirection,
              createdAt: data.createdAt?.toDate?.() ?? null,
            };
          }),
        );
      },
      (err) => setError(err.message),
    );
  }, [room.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-4 bg-panel px-6 py-4">
        <Avatar name={room.name} size="md" />
        <div className="min-w-0">
          <h2 className="truncate text-lg text-default">{room.name}</h2>
          <div className="flex items-center gap-2 text-sm text-muted">
            <PlatformTag platform={room.platform} />
            <span>·</span>
            <span className="capitalize">{room.status}</span>
          </div>
        </div>
      </header>
      <Tabs tabs={ROOM_VIEWS} active={view} onChange={setView} className="px-2" />

      {/* Chat stays mounted while Notes is open so the live feed and any draft survive. */}
      <div
        role="tabpanel"
        aria-label="Chat"
        hidden={view !== "chat"}
        className={`min-h-0 flex-1 flex-col ${view === "chat" ? "flex" : "hidden"}`}
      >
        <div className="flex-1 space-y-3 overflow-y-auto bg-raised p-6">
          {error && <p className="text-center text-sm text-danger">{error}</p>}
          {!error && messages.length === 0 && (
            <p className="text-center text-sm text-muted">No messages yet. Say hello 👋</p>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>

        <Composer roomId={room.id} />
      </div>

      {view === "notes" && (
        <div role="tabpanel" aria-label="Notes" className="flex min-h-0 flex-1 flex-col">
          <NotesPanel roomId={room.id} />
        </div>
      )}
    </section>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const outbound = message.direction === "outbound";
  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[65%] whitespace-pre-wrap break-words rounded px-4 py-2 text-white shadow-md ${
          outbound ? "bg-primary" : "bg-panel"
        }`}
      >
        <p>{message.text}</p>
        {message.createdAt && (
          <time className={`mt-1 block text-right text-xs ${outbound ? "text-white/80" : "text-muted"}`}>
            {clockTime(message.createdAt)}
          </time>
        )}
      </div>
    </div>
  );
}

function Composer({ roomId }: { roomId: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      await addDoc(collection(db, "rooms", roomId, "messages"), {
        text: body,
        direction: "outbound" satisfies MessageDirection,
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={send} className="border-t border-raised bg-panel px-6 py-4">
      <div className="flex gap-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          aria-label="Message"
          maxLength={4000}
          className="min-w-0 flex-1 rounded-md border border-input-border bg-panel px-4 py-2 text-default placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="flex items-center gap-2 rounded bg-primary px-5 py-2 text-white disabled:opacity-50"
        >
          <SendIcon width={18} height={18} />
          Send
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  );
}
