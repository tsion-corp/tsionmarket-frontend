"use client";

// A tab carries a stable value (the filter key) and a display label, so the
// "All" tab can be translated without changing the value the list filters on.
export interface RwaCategoryTab<T extends string> {
  value: T;
  label: string;
}

interface RwaCategoryTabsProps<T extends string> {
  tabs: readonly RwaCategoryTab<T>[];
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
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`shrink-0 cursor-pointer rounded-full border px-[18px] py-[9px] font-sans text-[13.5px] font-medium transition-colors ${
            active === tab.value
              ? "border-accent/30 bg-accent/14 text-white"
              : "border-white/10 bg-white/4 text-white/65 hover:text-white"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
