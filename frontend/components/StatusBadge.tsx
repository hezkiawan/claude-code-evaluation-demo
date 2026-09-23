import type { RoomStatus } from "@/lib/types";

// success/active → primary, error/ended → danger, neutral → gray.
const styles: Record<RoomStatus, string> = {
  assigned: "bg-primary",
  idle: "bg-neutral",
  bot: "bg-neutral",
  closed: "bg-danger",
};

export default function StatusBadge({ status }: { status: RoomStatus }) {
  return (
    <span className={`rounded px-2 py-0.5 text-sm capitalize leading-tight text-white ${styles[status]}`}>
      {status}
    </span>
  );
}
