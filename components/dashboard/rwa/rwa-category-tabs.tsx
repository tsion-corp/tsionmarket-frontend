"use client";

interface RwaCategoryTabsProps<T extends string> {
  tabs: readonly T[];
  active: T;
  onChange: (tab: T) => void;
}

export function RwaCategoryTabs<T extends string>({
  tabs,
  active,
  onChange,
}: RwaCategoryTabsProps<T>) {
  return (
    <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`shrink-0 cursor-pointer rounded-full border px-[18px] py-[9px] font-sans text-[13.5px] font-medium transition-colors ${
            active === tab
              ? "border-accent/30 bg-accent/14 text-white"
              : "border-white/10 bg-white/4 text-white/65 hover:text-white"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
