"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { CoinBadge } from "@/components/ui/coin-badge";
import { SearchIcon, ChevronLeftIcon, ArrowRightIcon } from "@/components/ui/icons";
import { useDepositChains, useDepositTokens } from "@/hooks/use-deposit";
import type { DepositChain, DepositToken } from "@/lib/deposit";

interface ChainTokenPickerProps {
  chainLabel: string;
  chain: DepositChain | null;
  token: DepositToken | null;
  onChain: (chain: DepositChain) => void;
  onToken: (token: DepositToken) => void;
}

function ChainGlyph({ chain, size = 30 }: { chain: DepositChain; size?: number }) {
  if (chain.logoUrl) {
    return (
      // Dextopus serves logos from varied hosts; next/image would reject them.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={chain.logoUrl}
        alt={chain.name}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-[10px] bg-white/6 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return <CoinBadge sym={chain.name.slice(0, 2).toUpperCase()} bg="#26262b" size={size} />;
}

function Row({
  glyph,
  title,
  subtitle,
  onClick,
}: {
  glyph: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] border border-white/8 bg-white/4 px-3.5 py-3 text-left transition-colors hover:bg-white/8"
    >
      {glyph}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
          {subtitle}
        </span>
        <span className="block truncate font-sans text-[14.5px] font-medium text-white">
          {title}
        </span>
      </span>
      <span className="text-white/35">
        <ArrowRightIcon size={15} />
      </span>
    </button>
  );
}

function SearchList({
  title,
  query,
  onQuery,
  onBack,
  children,
}: {
  title: string;
  query: string;
  onQuery: (v: string) => void;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("fundsFlow");
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-normal text-white/60 hover:text-white"
      >
        <ChevronLeftIcon size={14} />
        {title}
      </button>
      <div className="ws-inset flex items-center gap-2.5 px-3.5 py-2.5">
        <SearchIcon size={16} />
        <input
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full border-none bg-transparent text-[14px] text-white outline-none"
        />
      </div>
      <div className="mt-2 flex max-h-[46vh] flex-col gap-1 overflow-y-auto pr-0.5">{children}</div>
    </div>
  );
}

// Origin or destination selector for a Dextopus route. Picks a network from the
// live chain list, then a token from that network. Selecting a new network
// clears the token so the two never drift out of sync.
export function ChainTokenPicker({
  chainLabel,
  chain,
  token,
  onChain,
  onToken,
}: ChainTokenPickerProps) {
  const t = useTranslations("fundsFlow");
  const [open, setOpen] = useState<"chain" | "token" | null>(null);
  const [query, setQuery] = useState("");

  const chains = useDepositChains();
  const tokens = useDepositTokens(chain?.chainId ?? null);

  const filteredChains = (chains.data ?? []).filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );
  const filteredTokens = (tokens.data ?? []).filter(
    (t) =>
      t.symbol.toLowerCase().includes(query.toLowerCase()) ||
      t.name.toLowerCase().includes(query.toLowerCase())
  );

  if (open === "chain") {
    return (
      <SearchList title={chainLabel} query={query} onQuery={setQuery} onBack={() => setOpen(null)}>
        {chains.isPending ? (
          <div className="py-6 text-center text-[13px] font-normal text-white/50">
            {t("loadingNetworks")}
          </div>
        ) : chains.isError ? (
          <div className="py-6 text-center text-[13px] font-normal text-white/50">
            {t("networksError")}{" "}
            <button onClick={() => chains.refetch()} className="text-accent cursor-pointer">
              {t("retry")}
            </button>
          </div>
        ) : (
          filteredChains.map((c) => (
            <button
              key={c.chainId}
              onClick={() => {
                onChain(c);
                setQuery("");
                setOpen(null);
              }}
              className="flex cursor-pointer items-center gap-3 rounded-[12px] px-2 py-2 text-left hover:bg-white/6"
            >
              <ChainGlyph chain={c} />
              <span className="font-sans text-[14px] font-medium text-white">{c.name}</span>
            </button>
          ))
        )}
      </SearchList>
    );
  }

  if (open === "token") {
    return (
      <SearchList title={t("token")} query={query} onQuery={setQuery} onBack={() => setOpen(null)}>
        {tokens.isPending ? (
          <div className="py-6 text-center text-[13px] font-normal text-white/50">
            {t("loadingTokens")}
          </div>
        ) : tokens.isError ? (
          <div className="py-6 text-center text-[13px] font-normal text-white/50">
            {t("tokensError")}{" "}
            <button onClick={() => tokens.refetch()} className="text-accent cursor-pointer">
              {t("retry")}
            </button>
          </div>
        ) : (
          filteredTokens.map((t) => (
            <button
              key={t.address}
              onClick={() => {
                onToken(t);
                setQuery("");
                setOpen(null);
              }}
              className="flex cursor-pointer items-center gap-3 rounded-[12px] px-2 py-2 text-left hover:bg-white/6"
            >
              <AssetIcon sym={t.symbol} bg="#26262b" size={30} logo={t.logoUrl} />
              <span className="min-w-0">
                <span className="block truncate font-sans text-[14px] font-medium text-white">
                  {t.symbol}
                </span>
                <span className="block truncate text-[12px] font-normal text-white/50">
                  {t.name}
                </span>
              </span>
            </button>
          ))
        )}
      </SearchList>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Row
        glyph={chain ? <ChainGlyph chain={chain} /> : <CoinBadge sym="?" bg="#26262b" size={30} />}
        subtitle={chainLabel}
        title={chain ? chain.name : t("selectNetwork")}
        onClick={() => {
          setQuery("");
          setOpen("chain");
        }}
      />
      <Row
        glyph={
          token ? (
            <AssetIcon sym={token.symbol} bg="#26262b" size={30} logo={token.logoUrl} />
          ) : (
            <CoinBadge sym="?" bg="#26262b" size={30} />
          )
        }
        subtitle={t("token")}
        title={
          token
            ? `${token.symbol} · ${token.name}`
            : chain
              ? t("selectToken")
              : t("pickNetworkFirst")
        }
        onClick={() => {
          if (!chain) return;
          setQuery("");
          setOpen("token");
        }}
      />
    </div>
  );
}
