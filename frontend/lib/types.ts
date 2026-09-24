export type Platform = "whatsapp" | "livechat";
export type PlatformFilter = Platform | "all";
export type RoomStatus = "assigned" | "idle" | "bot" | "closed";

export interface Room {
  id: string;
  name: string;
  platform: Platform;
  status: RoomStatus;
  createdAt: string; // ISO timestamp from the Go API
  assignedAt?: string; // set once an agent picks up the room
  slaBreached: boolean; // waited past the SLA before being assigned
}

export type MessageDirection = "inbound" | "outbound";

export interface Message {
  id: string;
  text: string;
  direction: MessageDirection;
  createdAt: Date | null;
}
