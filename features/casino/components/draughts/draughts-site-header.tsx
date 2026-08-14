import Link from "next/link";
import { MarketLogo } from "@/components/ui/market-logo";
import styles from "@/features/casino/components/draughts/draughts-site-header.module.css";

interface MenuEntry {
  label: string;
  href: string;
}

const SECTIONS: ReadonlyArray<{ label: string; href: string; entries: readonly MenuEntry[] }> = [
  {
    label: "Play",
    href: "/casino/checkers/create",
    entries: [
      { label: "Create a game", href: "/casino/checkers/create" },
      { label: "Play against computer", href: "/casino/checkers?computer=1" },
      { label: "Current games", href: "/casino/checkers?live=1" },
      { label: "Swiss tournaments", href: "/casino/checkers/tournaments" },
    ],
  },
  {
    label: "Learn",
    href: "/casino/checkers/learn",
    entries: [
      { label: "Puzzles", href: "/casino/checkers/learn" },
      { label: "Practice", href: "/casino/checkers/learn?mode=training" },
      { label: "Rules & variants", href: "/casino/checkers/learn?mode=rules" },
    ],
  },
  {
    label: "Watch",
    href: "/casino/checkers?live=1",
    entries: [
      { label: "Current games", href: "/casino/checkers?live=1" },
      { label: "Tournament games", href: "/casino/checkers/tournaments" },
    ],
  },
  {
    label: "Community",
    href: "/casino/checkers/tournaments",
    entries: [
      { label: "Teams", href: "/casino/checkers/tournaments" },
      { label: "FAQ", href: "/casino/checkers/learn?mode=rules" },
    ],
  },
  {
    label: "Tools",
    href: "/casino/checkers/learn?mode=training",
    entries: [
      { label: "Training board", href: "/casino/checkers/learn?mode=training" },
      { label: "Rules & variants", href: "/casino/checkers/learn?mode=rules" },
    ],
  },
];

export function DraughtsSiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <Link href="/casino/checkers" className={styles.brand} aria-label="Market checkers">
          <MarketLogo className={styles.logo} />
        </Link>
        <nav className={styles.nav} aria-label="Draughts">
          {SECTIONS.map((section) => (
            <section key={section.label} className={styles.section}>
              <Link href={section.href} className={styles.sectionTitle}>
                {section.label}
              </Link>
              <div className={styles.menu} role="group" aria-label={`${section.label} menu`}>
                {section.entries.map((entry) => (
                  <Link key={`${section.label}-${entry.label}`} href={entry.href}>
                    {entry.label}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </nav>
      </div>
      <Link href="/casino" className={styles.exit}>
        <span aria-hidden>←</span> Back
      </Link>
    </header>
  );
}
