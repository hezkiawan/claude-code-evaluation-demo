import type { Platform } from "@/lib/types";
import { LivechatIcon, WhatsAppIcon } from "./icons";

const labels: Record<Platform, string> = { whatsapp: "WhatsApp", livechat: "Livechat" };

export default function PlatformTag({ platform }: { platform: Platform }) {
  const Icon = platform === "whatsapp" ? WhatsAppIcon : LivechatIcon;
  return (
    <span className="flex items-center gap-1.5 truncate text-sm text-muted">
      <Icon className="shrink-0 text-primary" />
      <span className="truncate">{labels[platform]}</span>
    </span>
  );
}
