import { Wordmark } from "@/components/ui/wordmark";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "#markets", label: "Markets" },
      { href: "#naira", label: "Funding" },
      { href: "#how", label: "How it works" },
      { href: "#early", label: "Get started" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "#values", label: "Security" },
      { href: "#", label: "Careers" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    title: "Connect",
    links: [
      { href: "#", label: "X / Twitter" },
      { href: "#", label: "Telegram" },
      { href: "#", label: "Discord" },
      { href: "#", label: "Contact" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative z-[2] border-t border-white/8 bg-black">
      <div className="mx-auto grid max-w-[1120px] grid-cols-2 gap-8 px-6 pt-14 pb-9 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <Wordmark href="#top" />
          <p className="mt-4 max-w-[32ch] text-sm leading-[1.6] font-normal text-white/60">
            The super app for global markets. Own your money, answer to no one.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <div className="ws-display mb-3.5 text-base">{col.title}</div>
            <div className="flex flex-col gap-2.5 text-sm font-normal">
              {col.links.map((l) => (
                <a key={l.label} href={l.href} className="hover:text-accent text-white/60">
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-3 border-t border-white/6 px-6 pt-[22px] pb-10">
        <span className="text-[13px] font-normal text-white/40">
          © 2026 TSION. All rights reserved.
        </span>
        <span className="max-w-[60ch] text-right text-xs font-normal text-white/35">
          Not investment advice. Crypto and market products carry risk, including loss of principal.
        </span>
      </div>
    </footer>
  );
}
