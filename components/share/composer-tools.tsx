"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { MarketSquareTopic } from "@/lib/api/market-square";
import type { TradableSymbol } from "@/lib/square/tradable";

/**
 * The composer's attachment row.
 *
 * Only two tools, and that is the point. The reference composer we are working
 * from carries seven — emoji, image, hashtag, cashtag, chart/PNL, gift, more —
 * but four of them have nothing behind them in this platform: there is no
 * sentiment field on a post, no gift or red-packet flow, and no poll or
 * schedule. Shipping those buttons would be shipping decoration that fails on
 * tap, which costs more trust than the missing feature costs delight.
 *
 * What IS real:
 *
 *  - **$** inserts a symbol this app can actually trade. It is the highest
 *    value tool here and it exists nowhere else: the feed renders those tags
 *    as chips that open Ark's buy sheet, so tagging a coin makes the post
 *    actionable rather than merely mentioning it.
 *  - **#** attaches topics from the square's own vocabulary, which is what the
 *    feed's tab strip filters on — so a tagged post is findable.
 */
/** Reactions a market feed actually reaches for. */
const EMOJI = [
  "🚀",
  "📈",
  "📉",
  "🔥",
  "💎",
  "🙌",
  "👀",
  "🤝",
  "🧠",
  "⚠️",
  "😂",
  "🎯",
  "💰",
  "🐂",
  "🐻",
  "✅",
] as const;

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={active}
      className={
        "grid size-8 place-items-center rounded-lg text-[15px] font-semibold transition-colors " +
        "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none " +
        (active ? "bg-grey-800 text-white" : "text-grey-500 hover:text-grey-200")
      }
    >
      {children}
    </button>
  );
}

export function ComposerTools({
  markets,
  topics,
  selectedTopics,
  onToggleTopic,
  onInsertSymbol,
  onInsertText,
  disabled,
}: {
  markets: TradableSymbol[];
  topics: MarketSquareTopic[];
  selectedTopics: string[];
  onToggleTopic: (key: string) => void;
  onInsertSymbol: (symbol: string) => void;
  onInsertText: (text: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("square");
  const [panel, setPanel] = useState<"symbol" | "topic" | "emoji" | null>(null);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = query.trim().toUpperCase();
    const pool = needle
      ? markets.filter(
          (m) => m.symbol.toUpperCase().includes(needle) || m.name.toUpperCase().includes(needle)
        )
      : markets;
    // Capped: this is a picker, not the markets table. More than a dozen rows
    // in a sheet above a keyboard is a scroll nobody completes.
    return pool.slice(0, 12);
  }, [markets, query]);

  return (
    <div>
      <div className="flex items-center gap-1">
        <ToolButton
          label={t("toolEmoji")}
          active={panel === "emoji"}
          onClick={() => !disabled && setPanel(panel === "emoji" ? null : "emoji")}
        >
          <span aria-hidden>☺</span>
        </ToolButton>
        <ToolButton
          label={t("toolSymbol")}
          active={panel === "symbol"}
          onClick={() => !disabled && setPanel(panel === "symbol" ? null : "symbol")}
        >
          $
        </ToolButton>
        <ToolButton
          label={t("toolTopic")}
          active={panel === "topic"}
          onClick={() => !disabled && setPanel(panel === "topic" ? null : "topic")}
        >
          #
        </ToolButton>

        {selectedTopics.length > 0 ? (
          <span className="text-grey-500 ml-1 text-[12px]">
            {t("topicsChosen", { count: selectedTopics.length })}
          </span>
        ) : null}
      </div>

      {panel === "emoji" ? (
        // A fixed set, not a full picker. A composer for market takes lives on
        // a dozen reactions; pulling in an emoji library for the rest would
        // cost more bundle than the long tail is worth here.
        <div className="border-grey-800 mt-2 flex flex-wrap gap-1 rounded-xl border bg-black/40 p-2.5">
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onInsertText(emoji)}
              aria-label={emoji}
              className="hover:bg-grey-800 grid size-8 place-items-center rounded-lg text-[17px] transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {panel === "symbol" ? (
        <div className="border-grey-800 mt-2 rounded-xl border bg-black/40 p-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("symbolSearch")}
            aria-label={t("symbolSearch")}
            className="mb-2 w-full rounded-lg bg-white/5 px-2.5 py-1.5 text-[13px] text-white outline-none placeholder:text-white/30"
          />
          {matches.length === 0 ? (
            <p className="text-grey-500 px-1 py-2 text-[12.5px]">{t("symbolNone")}</p>
          ) : (
            <ul className="ws-no-scrollbar max-h-[168px] overflow-y-auto">
              {matches.map((market) => (
                <li key={market.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      onInsertSymbol(market.symbol);
                      setPanel(null);
                      setQuery("");
                    }}
                    className="hover:bg-grey-800 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors"
                  >
                    <span className="text-accent text-[13px] font-semibold">${market.symbol}</span>
                    <span className="text-grey-500 truncate text-[12px]">{market.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {panel === "topic" ? (
        <div className="border-grey-800 mt-2 flex flex-wrap gap-1.5 rounded-xl border bg-black/40 p-2.5">
          {topics.length === 0 ? (
            <p className="text-grey-500 text-[12.5px]">{t("topicsNone")}</p>
          ) : (
            topics.map((topic) => {
              const on = selectedTopics.includes(topic.key);
              return (
                <button
                  key={topic.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleTopic(topic.key)}
                  className={
                    "rounded-full px-2.5 py-1 text-[12.5px] font-medium transition-colors " +
                    (on
                      ? "bg-accent text-ink"
                      : "border-grey-700 text-grey-300 hover:bg-grey-800 border")
                  }
                >
                  {topic.label}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
