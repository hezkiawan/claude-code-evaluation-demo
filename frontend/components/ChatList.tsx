"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { claimRoom, createRoom, fetchRooms } from "@/lib/api";
import { CURRENT_AGENT, isClaimable, isSlaBreached } from "@/lib/claim";
import { relativeTime } from "@/lib/format";
import type { Platform, PlatformFilter, Room, RoomStatus } from "@/lib/types";
import Avatar from "./Avatar";
import PlatformTag from "./PlatformTag";
import SlaBadge from "./SlaBadge";
import StatusBadge from "./StatusBadge";
import Tabs from "./Tabs";
import { PlusIcon } from "./icons";

const PLATFORM_TABS = [
  { value: "all", label: "All Platforms" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "livechat", label: "Livechat" },
] as const satisfies readonly { value: PlatformFilter; label: string }[];

const STATUS_TABS = [
  { value: "assigned", label: "Assigned" },
  { value: "idle", label: "Idle" },
  { value: "bot", label: "Bot" },
  { value: "closed", label: "Closed" },
] as const satisfies readonly { value: RoomStatus; label: string }[];

interface ChatListProps {
  selectedRoomId: string | null;
  onSelect: (room: Room) => void;
}

export default function ChatList({ selectedRoomId, onSelect }: ChatListProps) {
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [status, setStatus] = useState<RoomStatus>("idle");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const load = useCallback(async (s: RoomStatus) => {
    setLoading(true);
    setError(null);
    setClaimError(null);
    try {
      setRooms(await fetchRooms(s));
    } catch (err) {
      setRooms([]);
      setError(err instanceof Error ? err.message : "Failed to load rooms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(status);
  }, [status, load]);

  // Tick every second so SLA badges appear live and timestamps stay fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(
    () => (platform === "all" ? rooms : rooms.filter((r) => r.platform === platform)),
    [rooms, platform],
  );

  const handleCreated = (room: Room) => {
    if (status === room.status) setRooms((prev) => [room, ...prev]);
    else setStatus(room.status);
    onSelect(room);
  };

  const handleClaim = async (room: Room) => {
    setClaimingId(room.id);
    setClaimError(null);
    try {
      const claimed = await claimRoom(room.id, CURRENT_AGENT);
      setRooms((prev) => prev.filter((r) => r.id !== claimed.id));
      setStatus("assigned");
      onSelect(claimed);
    } catch (err) {
      // Most likely someone else claimed or closed it; refresh, then show why.
      await load(status);
      setClaimError(`Could not claim ${room.name}: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-r border-raised bg-panel">
      <Tabs tabs={PLATFORM_TABS} active={platform} onChange={setPlatform} />
      <NewRoomForm onCreated={handleCreated} />
      <Tabs tabs={STATUS_TABS} active={status} onChange={setStatus} className="justify-between px-2" />

      <ul className="flex-1 space-y-1 overflow-y-auto p-3">
        {claimError && (
          <li role="alert" className="px-2 pb-2 text-sm text-danger">
            {claimError}
          </li>
        )}
        {loading && <ListNote>Loading…</ListNote>}
        {!loading && error && <ListNote tone="error">{error}</ListNote>}
        {!loading && !error && visible.length === 0 && <ListNote>No {status} chats</ListNote>}
        {!loading &&
          visible.map((room) => (
            <li key={room.id}>
              <ChatTile
                room={room}
                now={now}
                selected={room.id === selectedRoomId}
                claiming={claimingId === room.id}
                onClick={() => onSelect(room)}
                onClaim={() => handleClaim(room)}
              />
            </li>
          ))}
      </ul>
    </aside>
  );
}

interface ChatTileProps {
  room: Room;
  now: Date;
  selected: boolean;
  claiming: boolean;
  onClick: () => void;
  onClaim: () => void;
}

function ChatTile({ room, now, selected, claiming, onClick, onClaim }: ChatTileProps) {
  const claimable = isClaimable(room);
  return (
    // The Claim button sits outside the select button: buttons can't nest.
    <div className={`relative rounded-lg transition-colors ${selected ? "bg-raised" : "hover:bg-raised"}`}>
      <button
        onClick={onClick}
        aria-current={selected ? "true" : undefined}
        className="flex w-full gap-4 rounded-lg p-4 text-left"
      >
        <Avatar name={room.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-lg font-medium text-default">{room.name}</span>
            <time dateTime={room.createdAt} className="shrink-0 text-sm text-muted">
              {relativeTime(new Date(room.createdAt), now)}
            </time>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 border-b border-raised pb-2">
            <span className="truncate text-sm text-muted">
              {room.assignedAgent ? `Assigned to ${room.assignedAgent}` : "Customer conversation"}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {isSlaBreached(room, now) && <SlaBadge />}
              <StatusBadge status={room.status} />
            </span>
          </div>
          <div className={`mt-2 ${claimable ? "pr-20" : ""}`}>
            <PlatformTag platform={room.platform} />
          </div>
        </div>
      </button>
      {claimable && (
        <button
          onClick={onClaim}
          disabled={claiming}
          aria-label={`Claim ${room.name}`}
          className="absolute bottom-3 right-4 rounded bg-primary px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {claiming ? "Claiming…" : "Claim"}
        </button>
      )}
    </div>
  );
}

function ListNote({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <li className={`py-6 text-center text-sm ${tone === "error" ? "text-danger" : "text-muted"}`}>{children}</li>
  );
}

function NewRoomForm({ onCreated }: { onCreated: (room: Room) => void }) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<Platform>("whatsapp");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await createRoom(name.trim(), platform));
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setSubmitting(false);
    }
  };

  const field = "rounded-md border border-input-border bg-panel px-3 py-2 text-sm text-default placeholder:text-muted";

  return (
    <form onSubmit={submit} className="space-y-2 border-b border-raised p-4">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New customer name…"
          maxLength={100}
          aria-label="Customer name"
          className={`${field} min-w-0 flex-1`}
        />
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform)}
          aria-label="Platform"
          className={field}
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="livechat">Livechat</option>
        </select>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          aria-label="Create room"
          className="flex items-center justify-center rounded-md bg-primary px-3 text-white disabled:opacity-50"
        >
          <PlusIcon width={18} height={18} />
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
