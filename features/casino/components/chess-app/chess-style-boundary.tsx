"use client";

import { useInsertionEffect } from "react";

const BASE_STYLES = [
  "/chess/lichess/css/theme.css",
  "/chess/lichess/css/site.css",
] as const;

function findStyle(href: string): HTMLLinkElement | null {
  return [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].find(
    (link) => link.getAttribute("href") === href
  ) ?? null;
}

function installBaseStyle(href: string): void {
  const existing = findStyle(href);
  if (existing) {
    existing.dataset.arkChessStyle = "true";
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.arkChessStyle = "true";
  document.head.append(link);
}

export function removeChessStyles(): void {
  for (const link of document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    const href = link.getAttribute("href") ?? "";
    if (
      link.dataset.arkChessStyle === "true" ||
      link.dataset.lichessRound === "true" ||
      href.startsWith("/chess/lichess/css/") ||
      href.startsWith("/css/")
    ) {
      link.remove();
    }
  }
}

export function ChessStyleBoundary() {
  useInsertionEffect(() => {
    BASE_STYLES.forEach(installBaseStyle);
    return removeChessStyles;
  }, []);

  return null;
}
