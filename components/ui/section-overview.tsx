"use client";

import Link from "next/link";

interface SectionOverviewProps {
  title: string;
  /** One line on what the service is, for someone who has not opened it. */
  blurb: string;
  /** The service's own page. */
  href: string;
  /** Footer label, e.g. "View all Spot". */
  action: string;
  children: React.ReactNode;
}

// A service's brief on the dashboard: what it is, a few live rows, and a way
// in. The heading itself is the link, so the caret beside it is the affordance
// the whole block is named by; the footer repeats it as a full-width target,
// which is the one a thumb actually reaches on a phone.
export function SectionOverview({ title, blurb, href, action, children }: SectionOverviewProps) {
  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <div className="ws-card overflow-hidden">
        <div className="px-4 pt-4 pb-3.5 sm:px-5 sm:pt-5">
          <Link href={href} className="group inline-flex items-center gap-1.5">
            <h2 className="ws-display text-[19px] tracking-[-0.01em] text-white">{title}</h2>
            <span
              aria-hidden
              className="text-[19px] leading-none text-white/40 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-white"
            >
              ›
            </span>
          </Link>
          <p className="mt-1 max-w-[56ch] text-[12.5px] font-normal text-white/50">{blurb}</p>
        </div>

        {children}

        <Link
          href={href}
          className="group flex items-center justify-center gap-1.5 border-t border-white/6 px-4 py-3 text-[12.5px] font-medium text-white/60 transition-colors hover:bg-white/4 hover:text-white sm:px-5"
        >
          {action}
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            ›
          </span>
        </Link>
      </div>
    </div>
  );
}
