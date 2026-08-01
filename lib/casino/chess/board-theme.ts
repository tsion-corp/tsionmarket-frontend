"use client";

import { useSyncExternalStore } from "react";

// Switchable board palettes. The grey set is the app default — the Ark greyscale
// the rest of the casino uses — and stays first so nothing changes unless a
// player picks another. The alternates are the familiar classic-board looks.
// Squares are the only thing a theme colours; the piece set, move markers, and
// coordinates derive from the square shade so every theme stays legible.

export interface BoardTheme {
  id: string;
  label: string;
  light: string;
  dark: string;
  // The two squares of the last move, one step brighter than their base shade.
  lightLast: string;
  darkLast: string;
  // The selected square, brighter still so it reads on either shade.
  lightSelected: string;
  darkSelected: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: "grey",
    label: "Slate",
    light: "#bfbfbf",
    dark: "#3c3c3c",
    lightLast: "#dcdcdc",
    darkLast: "#5a5a5a",
    lightSelected: "#f4f4f4",
    darkSelected: "#7a7a7a",
  },
  {
    id: "green",
    label: "Green",
    light: "#eeeed2",
    dark: "#769656",
    lightLast: "#f6f680",
    darkLast: "#bbcb44",
    lightSelected: "#f7f79a",
    darkSelected: "#cdd85a",
  },
  {
    id: "brown",
    label: "Wood",
    light: "#f0d9b5",
    dark: "#b58863",
    lightLast: "#ced26b",
    darkLast: "#aaa23a",
    lightSelected: "#dbe08a",
    darkSelected: "#c1b755",
  },
  {
    id: "blue",
    label: "Blue",
    light: "#dee3e6",
    dark: "#6f8fa8",
    lightLast: "#bfd0e0",
    darkLast: "#5f83a0",
    lightSelected: "#cfe0ef",
    darkSelected: "#7a9cbb",
  },
];

export const DEFAULT_THEME = BOARD_THEMES[0];

function themeById(id: string | null): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

const STORAGE_KEY = "casino.chess.boardTheme";

// A tiny external store so every board on the page shares one selection and a
// pick in the picker updates them all at once, persisted across reloads. Kept
// out of React context so it stays trivially removable — one module, no provider.
const listeners = new Set<() => void>();

function currentId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME.id;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME.id;
  } catch {
    return DEFAULT_THEME.id;
  }
}

export function setBoardTheme(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private-mode storage failure — the pick just won't persist.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  // Another tab changing the theme fires a storage event; mirror it here.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

export function useBoardTheme(): BoardTheme {
  const id = useSyncExternalStore(subscribe, currentId, () => DEFAULT_THEME.id);
  return themeById(id);
}
