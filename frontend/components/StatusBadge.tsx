import type { RoomStatus } from "@/lib/types";

// success/active → primary, error/ended → danger, neutral → gray.
const styles: Record<RoomStatus, string> = {
  assigned: "bg-primary",
  idle: "bg-neutral",
  bot: "bg-neutral",
  closed: "bg-danger",
};

export default function StatusBadge({ status, expired = false }: { status: RoomStatus; expired?: boolean }) {
  const [label, color] = expired ? ["Expired", "bg-danger"] : [status, styles[status]];
  return (
    <span className={`rounded px-2 py-0.5 text-sm capitalize leading-tight text-white ${color}`}>{label}</span>
  );
}
