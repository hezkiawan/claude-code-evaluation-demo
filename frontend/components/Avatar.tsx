import { initials } from "@/lib/format";

interface AvatarProps {
  name: string;
  size?: "md" | "lg";
  online?: boolean;
}

const sizes = { md: "h-12 w-12 text-lg", lg: "h-14 w-14 text-xl" } as const;

export default function Avatar({ name, size = "lg", online = false }: AvatarProps) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-primary text-white ${sizes[size]}`}
      aria-label={name}
    >
      {initials(name)}
      {online && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-online ring-2 ring-[var(--background-header)]" />
      )}
    </div>
  );
}
