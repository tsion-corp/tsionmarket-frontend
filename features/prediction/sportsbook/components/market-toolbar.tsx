"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export type SportsbookTimeFilter = "all" | "today" | "tomorrow";
export type SportsbookSort = "starts_at" | "turnover";
export type SportsbookView = "grid" | "list";

export interface MarketOption {
  key: string;
  label: string;
}

interface ToolbarOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

function ChevronIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`size-4 shrink-0 text-[#7e7e7e] transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path fill="currentColor" d="M7.41 8.58 12 13.17l4.59-4.59L18 10l-6 6-6-6z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 6v6l4 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
      <path
        fill="currentColor"
        d="m16 6 2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"
      />
    </svg>
  );
}

function DateSortIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <rect x="3" y="5" width="15" height="15" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M7 3v4M14 3v4M3 10h15M21 8v10m0 0-3-3m3 3 3-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LiveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 fill-current">
      <path d="M12.95 13.783a.834.834 0 0 1-.593-1.416 3.352 3.352 0 0 0 0-4.729.833.833 0 0 1 1.185-1.171 5.017 5.017 0 0 1 0 7.071.832.832 0 0 1-.592.245Zm-5.314-.24a.833.833 0 0 0 .006-1.179 3.352 3.352 0 0 1 0-4.728.833.833 0 1 0-1.185-1.172 5.017 5.017 0 0 0 0 7.072.833.833 0 0 0 1.179.007Zm8.557 2.016a8.29 8.29 0 0 0 0-11.118.833.833 0 1 0-1.236 1.118 6.624 6.624 0 0 1 0 8.882.833.833 0 1 0 1.236 1.118Zm-11.21.059a.833.833 0 0 0 .06-1.177 6.624 6.624 0 0 1 0-8.882.834.834 0 0 0-1.237-1.118 8.29 8.29 0 0 0 0 11.118.833.833 0 0 0 1.177.059ZM10 8.75a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z" />
    </svg>
  );
}

export function GridIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
      <path
        fill="currentColor"
        d="M8 8H4V4h4zm6-4h-4v4h4zm6 0h-4v4h4zM8 10H4v4h4zm6 0h-4v4h4zm6 0h-4v4h4zM8 16H4v4h4zm6 0h-4v4h4zm6 0h-4v4h4z"
      />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className="size-5">
      <path
        fill="currentColor"
        d="M17.563 30.277h.012a2.27 2.27 0 0 0 2.246 2.267v.002H80.18v-.001a2.27 2.27 0 0 0 2.259-2.268h.01V19.818a2.27 2.27 0 0 0-2.269-2.265H19.821a2.27 2.27 0 0 0-2.269 2.269c0 .039.01.076.012.115zm62.616 12.227H19.821a2.27 2.27 0 0 0-2.269 2.269c0 .039.01.076.012.115v10.34h.012a2.27 2.27 0 0 0 2.246 2.267v.002h60.359v-.001a2.27 2.27 0 0 0 2.259-2.268h.01V44.769a2.27 2.27 0 0 0-2.271-2.265m0 24.95H19.821a2.27 2.27 0 0 0-2.269 2.269c0 .039.01.076.012.115v10.34h.012a2.27 2.27 0 0 0 2.246 2.267v.002h60.359v-.001a2.27 2.27 0 0 0 2.259-2.269h.01V69.718a2.27 2.27 0 0 0-2.271-2.264"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ToolbarMenu<T extends string>({
  label,
  icon,
  value,
  options,
  onChange,
  desktopWidth = false,
  showLabel = true,
}: {
  label: string;
  icon: ReactNode;
  value: T;
  options: ToolbarOption<T>[];
  onChange: (value: T) => void;
  desktopWidth?: boolean;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 cursor-pointer items-center justify-between gap-2 rounded-lg border border-[#2e2e2e] bg-[#242424] px-2 py-2 text-[#ebebeb] transition-colors duration-200 hover:bg-[#2e2e2e] hover:text-white ${desktopWidth ? "min-[802px]:min-w-[140px]" : ""}`}
      >
        <span className="flex items-center gap-2">
          {icon}
          {showLabel ? (
            <span className="hidden text-sm font-medium capitalize min-[802px]:block">
              {selected?.label}
            </span>
          ) : null}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 min-w-[140px] origin-top-right overflow-hidden rounded-lg border border-[#2e2e2e] bg-[#242424] shadow-lg"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-left text-sm whitespace-nowrap transition-colors ${option.value === value ? "bg-[#2e2e2e] text-white" : "text-[#ebebeb] hover:bg-[#2e2e2e] hover:text-white"}`}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MarketSelector({
  options,
  selectedKey,
  onChange,
  className = "",
}: {
  options: MarketOption[];
  selectedKey: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.key === selectedKey) ?? options[0];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOptions = normalizedSearch
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedSearch))
    : options;

  useEffect(() => {
    if (!open) return;
    const focusFrame = requestAnimationFrame(() => inputRef.current?.focus());
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`relative w-full min-[1280px]:w-[28rem] min-[1280px]:max-w-[28rem] min-[1280px]:min-w-[28rem] ${className}`}
    >
      <button
        type="button"
        disabled={options.length === 0}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-[#2a2a2a] bg-white/[0.03] px-2 py-2 text-[#ebebeb] transition-[background,border-color,color] duration-200 ease-in-out hover:border-[#3a3a3a] hover:bg-white/[0.06] hover:text-white disabled:cursor-default"
      >
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
          {selected?.label ?? "Full Time Result"}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div className="absolute right-0 left-0 z-[110] mt-2 overflow-hidden rounded-lg border border-[#2e2e2e] bg-[#171717] shadow-[0_4px_10px_rgba(0,0,0,0.9)] min-[1280px]:right-auto min-[1280px]:left-1/2 min-[1280px]:w-[28rem] min-[1280px]:-translate-x-1/2">
          <label className="flex items-center gap-2 border-b border-[#1f1f1f] bg-[#171717] p-2 text-[#999]">
            <SearchIcon />
            <input
              ref={inputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search markets..."
              className="h-8 min-w-0 flex-1 rounded-lg border border-[#2e2e2e] bg-[#242424] px-2 text-sm text-[#ebebeb] outline-none placeholder:text-[#7e7e7e] focus:border-[#3a3a3a]"
            />
          </label>
          <div
            role="listbox"
            aria-label="Markets"
            className="max-h-[280px] overflow-y-auto bg-[#171717]"
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-[#999]">No markets found</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={option.key === selectedKey}
                  onClick={() => {
                    onChange(option.key);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full cursor-pointer items-center px-3 py-2.5 text-left text-sm transition-colors duration-200 ${option.key === selectedKey ? "bg-[#242424] text-white" : "text-[#ebebeb] hover:bg-[#242424] hover:text-white"}`}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface MarketToolbarProps {
  live: boolean;
  onLiveToggle: () => void;
  timeFilter: SportsbookTimeFilter;
  onTimeFilterChange: (filter: SportsbookTimeFilter) => void;
  sort: SportsbookSort;
  onSortChange: (sort: SportsbookSort) => void;
  view: SportsbookView;
  onViewChange: (view: SportsbookView) => void;
  marketOptions: MarketOption[];
  selectedMarketKey: string;
  onMarketChange: (key: string) => void;
}

const timeOptions: ToolbarOption<SportsbookTimeFilter>[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
];

const sortOptions: ToolbarOption<SportsbookSort>[] = [
  { value: "starts_at", label: "Date", icon: <DateSortIcon /> },
  { value: "turnover", label: "Volume", icon: <VolumeIcon /> },
];

const viewOptions: ToolbarOption<SportsbookView>[] = [
  { value: "grid", label: "Grid view", icon: <GridIcon /> },
  { value: "list", label: "List view", icon: <ListIcon /> },
];

function LiveButton({ live, onClick }: { live: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title="Live selector"
      aria-pressed={live}
      onClick={onClick}
      className={`flex h-8 w-fit cursor-pointer items-center gap-2 rounded-lg border bg-[#242424] px-2 py-2 transition-colors duration-200 hover:bg-[#2e2e2e] ${live ? "border-[#f42e52] text-[#f42e52]" : "border-[#2e2e2e] text-[#ebebeb] hover:text-white"}`}
    >
      <span className={live ? "text-[#f42e52]" : "text-[#999]"}>
        <LiveIcon />
      </span>
      <span className="text-sm font-medium whitespace-nowrap">Live</span>
    </button>
  );
}

export function MarketToolbar({
  live,
  onLiveToggle,
  timeFilter,
  onTimeFilterChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  marketOptions,
  selectedMarketKey,
  onMarketChange,
}: MarketToolbarProps) {
  return (
    <div className="relative z-20 overflow-visible border-b border-[#1f1f1f] px-2 py-2">
      <div className="flex w-full flex-col gap-2">
        <div className="hidden w-full items-center justify-between min-[802px]:flex">
          <LiveButton live={live} onClick={onLiveToggle} />
          <div className="flex items-center gap-2">
            <ToolbarMenu
              label="Time filter"
              icon={<ClockIcon />}
              value={timeFilter}
              options={timeOptions}
              onChange={onTimeFilterChange}
              desktopWidth
            />
            <ToolbarMenu
              label="Sort events"
              icon={sort === "turnover" ? <VolumeIcon /> : <DateSortIcon />}
              value={sort}
              options={sortOptions}
              onChange={onSortChange}
              desktopWidth
            />
            <div className="flex h-8 items-center overflow-hidden rounded-lg border border-[#2e2e2e] bg-[#242424]">
              <button
                type="button"
                title="Grid view"
                onClick={() => onViewChange("grid")}
                className={`flex h-full cursor-pointer items-center justify-center px-2 ${view === "grid" ? "bg-[#2e2e2e] text-white" : "text-[#7e7e7e] hover:bg-[#3b3b3b] hover:text-white"}`}
              >
                <GridIcon />
              </button>
              <button
                type="button"
                title="List view"
                onClick={() => onViewChange("list")}
                className={`flex h-full cursor-pointer items-center justify-center px-2 ${view === "list" ? "bg-[#2e2e2e] text-white" : "text-[#7e7e7e] hover:bg-[#3b3b3b] hover:text-white"}`}
              >
                <ListIcon />
              </button>
            </div>
          </div>
        </div>

        <div className="hidden w-full min-[802px]:flex min-[1280px]:hidden">
          <MarketSelector
            options={marketOptions}
            selectedKey={selectedMarketKey}
            onChange={onMarketChange}
          />
        </div>

        <div className="flex flex-col gap-2 min-[802px]:hidden">
          <div className="flex items-center justify-between gap-1">
            <LiveButton live={live} onClick={onLiveToggle} />
            <div className="flex items-center gap-1">
              <ToolbarMenu
                label="Time filter"
                icon={<ClockIcon />}
                value={timeFilter}
                options={timeOptions}
                onChange={onTimeFilterChange}
                showLabel={false}
              />
              <ToolbarMenu
                label="Sort events"
                icon={sort === "turnover" ? <VolumeIcon /> : <DateSortIcon />}
                value={sort}
                options={sortOptions}
                onChange={onSortChange}
                showLabel={false}
              />
              <ToolbarMenu
                label="View"
                icon={view === "grid" ? <GridIcon /> : <ListIcon />}
                value={view}
                options={viewOptions}
                onChange={onViewChange}
                showLabel={false}
              />
            </div>
          </div>
          <div className="flex w-full">
            <MarketSelector
              options={marketOptions}
              selectedKey={selectedMarketKey}
              onChange={onMarketChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
