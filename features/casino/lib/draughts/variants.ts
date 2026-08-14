import { startingFenForVariant, type DraughtsVariant } from "@/features/casino/lib/draughts/engine";

export type PlayableDraughtsVariant = Exclude<DraughtsVariant, "from_position">;

export interface DraughtsVariantOption {
  id: PlayableDraughtsVariant;
  label: string;
  shortLabel: string;
  description: string;
  board: "10x10" | "8x8";
  startingFen: string;
}

export const DRAUGHTS_VARIANT_OPTIONS: readonly DraughtsVariantOption[] = [
  {
    id: "standard",
    label: "International draughts",
    shortLabel: "Standard",
    description: "10x10 board, flying kings, longest capture required.",
    board: "10x10",
    startingFen: startingFenForVariant("standard"),
  },
  {
    id: "frisian",
    label: "Frisian draughts",
    shortLabel: "Frisian",
    description: "Diagonal and orthogonal captures with weighted capture priority.",
    board: "10x10",
    startingFen: startingFenForVariant("frisian"),
  },
  {
    id: "frysk",
    label: "Frysk",
    shortLabel: "Frysk",
    description: "Fast Frisian play with five pieces per side.",
    board: "10x10",
    startingFen: startingFenForVariant("frysk"),
  },
  {
    id: "antidraughts",
    label: "Antidraughts",
    shortLabel: "Antidraughts",
    description: "Win by losing all your pieces or having no legal move.",
    board: "10x10",
    startingFen: startingFenForVariant("antidraughts"),
  },
  {
    id: "breakthrough",
    label: "Breakthrough",
    shortLabel: "Breakthrough",
    description: "The first player to promote a man wins immediately.",
    board: "10x10",
    startingFen: startingFenForVariant("breakthrough"),
  },
  {
    id: "russian",
    label: "Russian draughts",
    shortLabel: "Russian",
    description: "8x8 board, any capture, with promotion during a sequence.",
    board: "8x8",
    startingFen: startingFenForVariant("russian"),
  },
  {
    id: "brazilian",
    label: "Brazilian draughts",
    shortLabel: "Brazilian",
    description: "8x8 international rules with the longest capture required.",
    board: "8x8",
    startingFen: startingFenForVariant("brazilian"),
  },
];

export function variantOption(variant: DraughtsVariant): DraughtsVariantOption {
  return (
    DRAUGHTS_VARIANT_OPTIONS.find((option) => option.id === variant) ?? DRAUGHTS_VARIANT_OPTIONS[0]
  );
}
