interface TabsProps<T extends string> {
  tabs: readonly { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
  className?: string;
}

export default function Tabs<T extends string>({ tabs, active, onChange, className = "" }: TabsProps<T>) {
  return (
    <div role="tablist" className={`flex border-b border-raised bg-panel ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={`-mb-px whitespace-nowrap border-b-[3px] px-4 py-3 text-base transition-colors ${
              isActive ? "border-primary text-primary" : "border-transparent text-default hover:text-primary"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
