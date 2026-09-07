"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { MemeGrid } from "@/features/trade/components/meme-grid";
import { MemeTradeSheet } from "@/features/trade/components/meme-trade-sheet";
import { MemeTrending } from "@/features/trade/components/meme-trending";
import type { MemeToken } from "@/lib/meme/api";

// The memecoin page: a trending shortlist and the whole catalog, on Base and
// Solana, each with its own search and risk bands. Both lists open the same
// sheet, so the board owns which coin is picked.
//
// Picking a coin goes straight to buying and selling rather than to a detail
// card first. The card read price, liquidity, market cap and a risk block from
// the token endpoint, and for a good number of coins that endpoint returns
// nothing to show. The sheet needs only the row already in hand, and refreshes
// it in the background.
export function MemeBoard() {
  const tSections = useTranslations("sections");
  const [open, setOpen] = useState<MemeToken | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-8 p-4 sm:p-6 lg:p-8">
      <Eyebrow>{tSections("meme")}</Eyebrow>
      <MemeTrending onOpen={setOpen} />
      <MemeGrid onOpen={setOpen} />
      {open ? <MemeTradeSheet token={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
