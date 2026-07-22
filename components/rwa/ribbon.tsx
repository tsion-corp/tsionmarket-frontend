import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui/icons";

export function Ribbon() {
  return (
    <div className="border-accent/20 bg-accent/8 flex items-center justify-between gap-3 border-b px-4 py-[9px] text-[12.5px] sm:px-6">
      <div className="flex items-center gap-2 text-white/75">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="7" width="16" height="12" rx="2" stroke="#A78BFA" strokeWidth="1.8" />
          <path d="M4 11h16" stroke="#A78BFA" strokeWidth="1.8" />
          <circle cx="7" cy="9" r="0.6" fill="#A78BFA" />
        </svg>
        <span className="tnum">rwa.worldstreet.xyz</span>
        <span className="hidden text-white/40 sm:inline">· real-world assets</span>
      </div>
      <Link
        href="/dashboard"
        className="hover:text-accent inline-flex items-center gap-1.5 text-white/80"
      >
        <ChevronLeftIcon />
        Back to app
      </Link>
    </div>
  );
}
