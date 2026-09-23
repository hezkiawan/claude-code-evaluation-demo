"use client";

import { useState } from "react";
import ChatList from "@/components/ChatList";
import ChatWindow from "@/components/ChatWindow";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import type { Room } from "@/lib/types";

export default function DashboardPage() {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1 flex-col gap-6 p-6">
          <Header />
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg bg-panel shadow-md">
            <ChatList selectedRoomId={selectedRoom?.id ?? null} onSelect={setSelectedRoom} />
            <ChatWindow room={selectedRoom} />
          </div>
        </main>
        <footer className="bg-panel px-6 py-3 text-right text-sm text-muted">
          Copyright © 2026: PT Helios Informatika Nusantara
        </footer>
      </div>
    </div>
  );
}
