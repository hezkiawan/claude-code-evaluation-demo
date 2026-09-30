import type { RoomStatus } from "@/lib/types";

// success/active → primary, error/ended → danger, neutral → gray.
const styles: Record<RoomStatus, string> = {
  assigned: "bg-primary",
  idle: "bg-neutral",
  bot: "bg-neutral",
  closed: "bg-danger",
};

// The shared badge shape: small rounded pill with white text. `className`
// supplies the background token.
export function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded px-2 py-0.5 text-sm leading-tight text-white ${className}`}>{children}</span>;
}

export default function StatusBadge({ status }: { status: RoomStatus }) {
  return <Pill className={`capitalize ${styles[status]}`}>{status}</Pill>;
}
