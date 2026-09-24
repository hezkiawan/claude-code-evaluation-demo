export type Platform = "whatsapp" | "livechat";
export type PlatformFilter = Platform | "all";
export type RoomStatus = "assigned" | "idle" | "bot" | "closed";

export interface Room {
  id: string;
  name: string;
  platform: Platform;
  status: RoomStatus;
  createdAt: string; // ISO timestamp from the Go API
  assignedAt?: string; // ISO timestamp, set once assigned
  slaBreached: boolean; // assigned after waiting past the 5-minute SLA
  expired: boolean; // server-computed: idle/bot room waiting past the SLA
}

export type MessageDirection = "inbound" | "outbound";

export interface Message {
  id: string;
  text: string;
  direction: MessageDirection;
  createdAt: Date | null;
}
