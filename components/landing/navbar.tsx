import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";
import { ArrowUpRightIcon } from "@/components/ui/icons";

const LINKS = [
  { href: "#markets", label: "Markets" },
  { href: "#naira", label: "Naira ramp" },
  { href: "#values", label: "Security" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar() {
  return (
    <nav className="ws-glass fixed top-4 left-1/2 z-[200] flex w-[min(1120px,calc(100%-24px))] -translate-x-1/2 items-center justify-between rounded-full py-[9px] pr-2.5 pl-[18px]">
      <Wordmark />
      <div className="hidden items-center gap-0.5 rounded-full border border-white/10 bg-white/5 p-[5px] lg:flex">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="hover:text-accent rounded-full px-3.5 py-2 text-sm font-medium text-white/90"
          >
            {l.label}
          </a>
        ))}
      </div>
      <Link
        href="/auth"
        className="text-ink inline-flex items-center gap-[7px] rounded-full bg-white px-5 py-[11px] text-sm font-semibold whitespace-nowrap hover:opacity-90"
      >
        Get started
        <ArrowUpRightIcon className="text-arrow" />
      </Link>
    </nav>
  );
}
