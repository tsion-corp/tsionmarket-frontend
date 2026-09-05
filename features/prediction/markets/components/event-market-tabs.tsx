import type { EventMarketGroupView, EventMarketTab } from "../event-detail-presenter";

interface EventMarketTabsProps {
  groups: EventMarketGroupView[];
  active: EventMarketTab;
  onChange: (tab: EventMarketTab) => void;
}

export function EventMarketTabs({ groups, active, onChange }: EventMarketTabsProps) {
  const tabs: Array<{ key: EventMarketTab; label: string }> = [
    { key: "all", label: "All" },
    ...groups.map((group) => ({ key: group.key, label: group.title })),
  ];

  return (
    <nav
      aria-label="Event market groups"
      className="flex [scrollbar-width:none] overflow-x-auto border-b border-white/8 bg-[#111114] px-2 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          aria-current={active === tab.key ? "page" : undefined}
          onClick={() => onChange(tab.key)}
          className={`relative min-h-12 shrink-0 cursor-pointer px-4 text-[12px] font-bold transition-colors after:absolute after:right-3 after:bottom-0 after:left-3 after:h-[3px] ${
            active === tab.key
              ? "text-white after:bg-[#d5d5da]"
              : "text-white/42 after:bg-transparent hover:text-white/75"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
