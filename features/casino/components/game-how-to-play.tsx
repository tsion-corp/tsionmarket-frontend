"use client";

import { useEffect, useId } from "react";
import styles from "./game-how-to-play.module.css";

interface GameHowToPlayProps {
  accent: "arkjet" | "chicken";
  open: boolean;
  title: string;
  steps: readonly string[];
  onClose: () => void;
}

export function GameHowToPlay({ accent, open, title, steps, onClose }: GameHowToPlayProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      data-accent={accent}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.header}>
          <div>
            <span>QUICK GUIDE</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close how to play">
            ×
          </button>
        </header>
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
        <button type="button" className={styles.done} onClick={onClose}>
          Got it
        </button>
      </section>
    </div>
  );
}
