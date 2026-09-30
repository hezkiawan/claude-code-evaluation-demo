export type Platform = "whatsapp" | "livechat";
export type PlatformFilter = Platform | "all";
export type RoomStatus = "assigned" | "idle" | "bot" | "closed";

export interface Room {
  id: string;
  name: string;
  platform: Platform;
  status: RoomStatus;
  createdAt: string; // ISO timestamp from the Go API
}

// Internal agent-only note on a room (rooms/{roomId}/notes), served by the Go API.
export interface Note {
  id: string;
  content: string;
  isImportant: boolean;
  createdAt: string; // ISO timestamp from the Go API
}

export type MessageDirection = "inbound" | "outbound";

export interface Message {
  id: string;
  text: string;
  direction: MessageDirection;
  createdAt: Date | null;
}
