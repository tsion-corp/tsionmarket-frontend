// Draughts boards do not look like chess boards. The sets people actually play
// on are red-and-buff or wooden, so the palettes here are those rather than the
// grey squares the chess board uses.
//
// Shape matches the chess BoardTheme so the same square-highlight logic works
// for both: a base pair, a lit pair for the last move, and a brighter pair for
// the square in hand.

export interface DraughtsBoardTheme {
  id: string;
  label: string;
  light: string;
  dark: string;
  lightLast: string;
  darkLast: string;
  lightSelected: string;
  darkSelected: string;
  /** Border around the whole board, standing in for the frame of a real set. */
  frame: string;
}

export const DRAUGHTS_BOARD_THEMES: DraughtsBoardTheme[] = [
  {
    // The set most people picture: warm buff squares against oxide red.
    id: "classic",
    label: "Classic red",
    light: "#e7d3ab",
    dark: "#9c3f30",
    lightLast: "#e3cf8f",
    darkLast: "#b04f3c",
    lightSelected: "#dcc478",
    darkSelected: "#c05b44",
    frame: "#4a2018",
  },
  {
    // A wooden board, closer to a folding travel set.
    id: "walnut",
    label: "Walnut",
    light: "#d9bc8c",
    dark: "#6b4429",
    lightLast: "#d6b276",
    darkLast: "#7d5232",
    lightSelected: "#cda75f",
    darkSelected: "#8d5e3a",
    frame: "#3a2415",
  },
  {
    // The tournament pairing: buff and green, easiest on the eye for long games.
    id: "tournament",
    label: "Tournament green",
    light: "#eaddb8",
    dark: "#4a7048",
    lightLast: "#e4d59c",
    darkLast: "#578055",
    lightSelected: "#dcc87f",
    darkSelected: "#639063",
    frame: "#26361f",
  },
];

export const DEFAULT_DRAUGHTS_THEME = DRAUGHTS_BOARD_THEMES[0];
