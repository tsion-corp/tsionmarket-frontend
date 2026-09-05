"use client";

import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui/icons";

interface PerpsBackLinkProps {
  href: string;
  label: string;
}

// Shared by the immersive, sidebar-free perps screens (/perps, /trade/:symbol)
// — same pill styling features/casino/components/casino-page.tsx uses for its
// own back link.
export function PerpsBackLink({ href, label }: PerpsBackLinkProps) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-sans text-[12.5px] font-medium text-white/60 transition-colors hover:border-white/25 hover:text-white"
    >
      <ChevronLeftIcon size={12} />
      {label}
    </Link>
  );
}
