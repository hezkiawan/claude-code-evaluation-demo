import type { Room } from "./types";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.trim().slice(0, 2);
  return letters.toUpperCase() || "??";
}

export function relativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// Mirrors SLAWindow in backend/handlers/rooms.go.
export const SLA_WINDOW_MS = 5 * 60 * 1000;

// A room's wait ends when it is assigned; until then it keeps growing.
// Closed rooms never show as expired.
export function isSlaExpired(room: Room, now: Date = new Date()): boolean {
  if (room.status === "closed") return false;
  if (room.assignedAt) return room.slaBreached;
  return now.getTime() - new Date(room.createdAt).getTime() > SLA_WINDOW_MS;
}

export function clockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
