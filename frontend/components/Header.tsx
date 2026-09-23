"use client";

import { useEffect, useState } from "react";
import { checkHealth } from "@/lib/api";
import Avatar from "./Avatar";
import { BellIcon, ChevronRightIcon } from "./icons";

type ApiStatus = "checking" | "online" | "offline";

const HEALTH_POLL_MS = 15_000;

export default function Header() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const ok = await checkHealth();
      if (!cancelled) setApiStatus(ok ? "online" : "offline");
    };
    poll();
    const id = setInterval(poll, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const dot = { checking: "bg-neutral", online: "bg-online", offline: "bg-danger" }[apiStatus];
  const label = { checking: "Checking API…", online: "API online", offline: "API offline" }[apiStatus];

  return (
    <header className="flex items-center justify-between rounded-lg bg-header px-6 py-4 shadow-md">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-lg text-muted">
        <span>Interactions</span>
        <ChevronRightIcon width={16} height={16} />
        <span>Chat</span>
      </nav>

      <div className="flex items-center gap-5">
        <div role="status" className="flex items-center gap-2 text-sm text-muted">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          {label}
        </div>
        <button aria-label="Notifications" className="text-default">
          <BellIcon width={24} height={24} />
        </button>
        <Avatar name="Helios Agent" size="md" online />
      </div>
    </header>
  );
}
