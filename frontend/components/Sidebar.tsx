import Image from "next/image";
import { ChatIcon, ContactsIcon, GridIcon, SearchIcon } from "./icons";

const Divider = () => <hr className="mx-auto my-3 w-9 border-t border-neutral" />;

export default function Sidebar() {
  return (
    <nav className="flex w-[88px] shrink-0 flex-col items-center bg-panel py-4" aria-label="Main">
      <div className="p-2">
        <Image src="/logo.webp" alt="Kouventa" width={44} height={54} priority />
      </div>

      <button
        className="mt-4 flex h-11 w-14 items-center justify-center rounded-md border border-input-border text-default"
        aria-label="Search"
      >
        <SearchIcon />
      </button>

      <Divider />
      <NavItem label="Dashboard" icon={<GridIcon />} />
      <Divider />
      <NavItem label="Chat" icon={<ChatIcon />} active />
      <Divider />
      <NavItem label="Contacts" icon={<ContactsIcon />} />
    </nav>
  );
}

function NavItem({ label, icon, active = false }: { label: string; icon: React.ReactNode; active?: boolean }) {
  return (
    <button
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`my-1 flex h-14 w-[72px] items-center justify-center rounded-lg text-white transition-colors ${
        active ? "bg-primary" : "hover:bg-raised"
      }`}
    >
      {icon}
    </button>
  );
}
