"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CURRENT_AGENT } from "@/lib/agent";
import { claimRoom, createRoom, fetchRooms } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { isSlaBreached } from "@/lib/sla";
import type { Platform, PlatformFilter, Room, RoomStatus } from "@/lib/types";
import Avatar from "./Avatar";
import PlatformTag from "./PlatformTag";
import StatusBadge, { Pill } from "./StatusBadge";
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

interface ClaimFailure {
  roomId: string;
  roomName: string;
  message: string;
}

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
  const [claimingIds, setClaimingIds] = useState<ReadonlySet<string>>(new Set());
  const [claimFailure, setClaimFailure] = useState<ClaimFailure | null>(null);

  // Only the most recent load may update the list, so a slow response for a
  // tab the user has left can't overwrite the current tab.
  const latestLoad = useRef(0);
  const load = useCallback(async (s: RoomStatus) => {
    const id = ++latestLoad.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRooms(s);
      if (id === latestLoad.current) setRooms(result);
    } catch (err) {
      if (id !== latestLoad.current) return;
      setRooms([]);
      setError(err instanceof Error ? err.message : "Failed to load rooms");
    } finally {
      if (id === latestLoad.current) setLoading(false);
    }
  }, []);

  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    load(status);
  }, [status, load]);

  // Ticks every second so SLA breaches show up live and timestamps stay fresh.
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

  const changeStatus = (s: RoomStatus) => {
    setClaimFailure(null);
    setStatus(s);
  };

  const handleClaim = async (room: Room) => {
    setClaimingIds((prev) => new Set(prev).add(room.id));
    setClaimFailure(null);
    try {
      const claimed = await claimRoom(room.id, CURRENT_AGENT);
      setStatus(claimed.status);
      onSelect(claimed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to claim room";
      setClaimFailure({ roomId: room.id, roomName: room.name, message });
      load(statusRef.current);
    } finally {
      setClaimingIds((prev) => {
        const next = new Set(prev);
        next.delete(room.id);
        return next;
      });
    }
  };

  // A failed claim is shown on its tile; if the reload dropped the room
  // (e.g. someone else claimed it), show it above the list instead.
  const orphanedFailure =
    !loading && claimFailure && !visible.some((r) => r.id === claimFailure.roomId) ? claimFailure : null;

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-r border-raised bg-panel">
      <Tabs tabs={PLATFORM_TABS} active={platform} onChange={setPlatform} />
      <NewRoomForm onCreated={handleCreated} />
      <Tabs tabs={STATUS_TABS} active={status} onChange={changeStatus} className="justify-between px-2" />

      <ul className="flex-1 space-y-1 overflow-y-auto p-3">
        {orphanedFailure && (
          <ListNote tone="error">
            {orphanedFailure.roomName}: {orphanedFailure.message}
          </ListNote>
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
                onSelect={() => onSelect(room)}
                onClaim={() => handleClaim(room)}
                claiming={claimingIds.has(room.id)}
                claimError={claimFailure?.roomId === room.id ? claimFailure.message : null}
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
  onSelect: () => void;
  onClaim: () => void;
  claiming: boolean;
  claimError: string | null;
}

// The select action and the Claim button are siblings so interactive
// elements never nest; Claim is overlaid on the tile's channel row.
function ChatTile({ room, now, selected, onSelect, onClaim, claiming, claimError }: ChatTileProps) {
  const claimable = isUnassigned(room.status);
  const breached = claimable && isSlaBreached(room, now);

  return (
    <div className={`rounded-lg transition-colors ${selected ? "bg-raised" : "hover:bg-raised"}`}>
      <div className="relative">
        <button
          onClick={onSelect}
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
                {room.status === "assigned" && room.assignedAgent
                  ? `Assigned to ${room.assignedAgent}`
                  : "Customer conversation"}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {breached && <Pill className="bg-danger">SLA breached</Pill>}
                <StatusBadge status={room.status} />
              </div>
            </div>
            <div className={`mt-2 ${claimable ? "pr-20" : ""}`}>
              <PlatformTag platform={room.platform} />
            </div>
          </div>
        </button>
        {claimable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClaim();
            }}
            disabled={claiming}
            className="absolute bottom-3 right-4 rounded bg-primary px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          >
            Claim
          </button>
        )}
      </div>
      {claimError && (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
          {claimError}
        </p>
      )}
    </div>
  );
}

function isUnassigned(status: RoomStatus): boolean {
  return status === "idle" || status === "bot";
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
