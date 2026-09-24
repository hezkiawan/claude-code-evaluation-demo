import type { RoomStatus } from "@/lib/types";

// success/active → primary, error/ended → danger, neutral → gray.
const styles: Record<RoomStatus, string> = {
  assigned: "bg-primary",
  idle: "bg-neutral",
  bot: "bg-neutral",
  closed: "bg-danger",
};

const pill = "rounded px-2 py-0.5 text-sm leading-tight text-white";

export default function StatusBadge({ status }: { status: RoomStatus }) {
  return <span className={`${pill} capitalize ${styles[status]}`}>{status}</span>;
}

export function ExpiredBadge() {
  return <span className={`${pill} bg-danger`}>Expired</span>;
}
