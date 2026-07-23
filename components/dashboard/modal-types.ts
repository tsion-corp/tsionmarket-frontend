export interface StatLine {
  k: string;
  v: string;
  c?: string;
}

export interface DetailPayload {
  sym: string;
  name: string;
  sub: string;
  price: string;
  chg: string;
  bg: string;
  stats: StatLine[];
  cta: string;
  onCta: () => void;
  coingeckoId?: string;
  up?: boolean;
  logo?: string | null;
}

export interface ConfirmPayload {
  eyebrow: string;
  badgeSym?: string;
  badgeBg?: string;
  badgeLogo?: string | null;
  title: string;
  sub: string;
  lines: StatLine[];
  cta: string;
  successTitle: string;
  successMsg: string;
}

export type DashboardModal =
  | { type: "detail"; detail: DetailPayload }
  | { type: "confirm"; confirm: ConfirmPayload }
  | { type: "funds" }
  | { type: "withdraw" }
  | { type: "send" }
  | { type: "account" }
  | { type: "done"; title: string; msg: string }
  | null;

export type { SectionId as DashboardSection } from "@/lib/sections";
