import styles from "@/features/casino/components/draughts/draughts-workspace.module.css";

export function DraughtsWorkspace({
  aside,
  board,
  panel,
  controls,
}: {
  aside?: React.ReactNode;
  board: React.ReactNode;
  panel: React.ReactNode;
  controls?: React.ReactNode;
}) {
  return (
    <div className={styles.root}>
      <main className={styles.workspace}>
        {aside ? <aside className={styles.aside}>{aside}</aside> : null}
        <section className={styles.board}>{board}</section>
        <section className={styles.panel}>{panel}</section>
        {controls ? <section className={styles.controls}>{controls}</section> : null}
      </main>
    </div>
  );
}

export const DRAUGHTS_PANEL_HEADER_CLASS =
  "flex min-h-12 items-center border-b border-white/10 bg-white/[0.035] px-4";

export const DRAUGHTS_PANEL_BUTTON_CLASS =
  "cursor-pointer border border-white/12 bg-white/[0.035] px-3 py-2 text-[13px] font-medium text-white/72 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35";
