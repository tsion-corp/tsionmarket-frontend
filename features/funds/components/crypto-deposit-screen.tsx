"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/ui/sheet-nav";
import { NetworkList } from "@/features/funds/components/network-list";
import { AssetIcon } from "@/components/ui/asset-icon";
import { QrCode } from "@/components/ui/qr-code";
import { SearchIcon } from "@/components/ui/icons";
import { useModalScreen } from "@/components/ui/modal-shell";
import { filterChains, filterTokens } from "@/features/funds/lib/search";
import { track } from "@/lib/analytics/mixpanel";
import { useDepositChains, useDepositTokens, useStaticDepositAddress } from "@/hooks/use-deposit";
import { usePortfolio } from "@/hooks/use-portfolio";
import { getWalletAddress } from "@/lib/user";
import { isRefundOptional, originFamily, refundChainType } from "@/lib/deposit-catalog";
import {
  depositMinimumUsd,
  SETTLE_CHAINS,
  type DepositChain,
  type DepositToken,
  type StaticAddressRequest,
} from "@/lib/deposit";
import type { DepositPrefill } from "@/lib/voice/intent";

interface CryptoDepositScreenProps {
  onBack: () => void;
  // Optional voice prefill: pre-select this chain (and token, when it matches).
  initialDeposit?: DepositPrefill;
}

// Deposits always settle to USDC on Base, so every user gets one deposit
// address per origin token regardless of which chain they send from.
const settle = SETTLE_CHAINS.base;
const POPULAR = ["ethereum", "base", "polygon", "arbitrum", "optimism", "avalanche"];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CryptoDepositScreen({ onBack, initialDeposit }: CryptoDepositScreenProps) {
  const [originChain, setOriginChain] = useState<DepositChain | null>(null);
  const [originToken, setOriginToken] = useState<DepositToken | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const chains = useDepositChains();
  const tokens = useDepositTokens(originChain?.chainId ?? null);

  const resetToken = () => setOriginToken(null);
  // Back out of the token list to the networks. The search box is shared by both
  // steps, so it is cleared on the way: a token name left in it would filter the
  // network list to nothing.
  const resetChain = () => {
    setOriginChain(null);
    setSearchQuery("");
  };
  const [showingHelp, setShowingHelp] = useState(false);
  const showingTokensStep = originChain !== null;

  /*
    Picker view — Figma node 2154:63768.

    Layout (absolute → flow):
      Back       top:15   left:16   icon 14 + gap-6 + "Back" 13px Geist Regular white/60
      Title      top:63   left:16   17.576px Mona Sans SemiBold capitalize tracking-[-0.18px]
      Subtitle              10px Mona Sans Regular white leading-[18px]
      Search     top:127  left:16   w:361 h:51 rounded-[50px] border-2 white/2% bg white/5%
                                    px:24 gap:7 icon:14 text:13px Medium tracking-[-0.39px]
      Info card  gap:17   left:16   w:361 h:51 rounded-[12px] same border+bg
      History    top:272  left:centered  "Search history" 13px white/45
      Recommended gap:15  "Recommended" 13px white/45
      Chips      rounded-full border-[0.56px] white/10 bg white/4% icon:~15 text:~12px Medium
      Token rows icon:22.66 rounded-[8.3px] name:~11px Medium ticker:~9px Regular white/50
  */
  const allChains = useMemo(() => chains.data ?? [], [chains.data]);

  // ── Search history from localStorage ──
  const HISTORY_KEY = "deposit-chain-history";
  const searchHistory = useMemo(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? (JSON.parse(raw) as number[]) : [];
    } catch {
      return [];
    }
  }, []);
  const historyChains = useMemo(
    () =>
      searchHistory
        .map((id) => allChains.find((c) => c.chainId === id))
        .filter(Boolean) as DepositChain[],
    [searchHistory, allChains]
  );
  const saveToHistory = (chainId: number) => {
    try {
      const prev: number[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
      const next = [chainId, ...prev.filter((id) => id !== chainId)].slice(0, 5);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* silent */
    }
  };

  // ── Recommended = popular chains ──
  const recommendedChains = useMemo(() => {
    const result: DepositChain[] = [];
    for (const name of POPULAR) {
      const found = allChains.find((c) => c.name.toLowerCase() === name);
      if (found) result.push(found);
    }
    return result;
  }, [allChains]);

  const selectChain = (chain: DepositChain) => {
    track("deposit_network_selected", { network: chain.name });
    saveToHistory(chain.chainId);
    setOriginChain(chain);
    setOriginToken(null);
  };

  // Filter chains by search query
  const filteredChains = useMemo(
    () => filterChains(allChains, searchQuery),
    [allChains, searchQuery]
  );

  // The shell draws Back beside its close button, so each step only says where
  // back goes. The funding flow takes the whole phone: it is a task, not a peek.
  useModalScreen({
    back: showingHelp ? () => setShowingHelp(false) : showingTokensStep ? resetChain : onBack,
    fullScreen: true,
  });

  const chipClass =
    "flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/10";

  if (showingHelp) return <HowToDepositView />;

  // Step 3: Address view (separate component — mounts wallet hooks)
  if (originToken && originChain) {
    return <DepositAddressView chain={originChain} token={originToken} onBack={resetToken} />;
  }

  // Steps 1 & 2: Network picker → Token picker, same modal, content swaps
  const showingTokens = showingTokensStep;
  const tokenList = tokens.data ?? [];
  const filteredTokenList = filterTokens(tokenList, searchQuery);

  return (
    <div className="flex flex-col">
      <div className="shrink-0 pb-3">
        {/* Title */}
        <div>
          <h2 className="text-[18px] leading-[22px] font-semibold tracking-[-0.18px] text-white">
            {showingTokens ? "Token To Send" : "Deposit Crypto"}
          </h2>
          {!showingTokens && (
            <p className="mt-1.5 text-[12px] leading-[16px] font-normal text-white/60">
              Send from almost anywhere. It arrives as US dollars in your balance.
            </p>
          )}
        </div>

        {/* Search */}
        <div className="mt-4">
          <div className="flex h-[44px] items-center gap-2.5 rounded-full border border-white/8 bg-white/[0.04] px-4">
            <SearchIcon size={14} className="shrink-0 text-white/40" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium tracking-[-0.39px] text-white placeholder:text-white/40 focus:outline-none"
            />
          </div>
        </div>

        {!showingTokens && (
          <>
            <button
              type="button"
              onClick={() => setShowingHelp(true)}
              className="mt-3 flex h-[44px] w-full cursor-pointer items-center gap-3 rounded-[12px] border border-white/8 bg-white/[0.04] px-4 text-left transition-colors hover:bg-white/8"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-white/25 text-[10px] text-white/50">
                ⓘ
              </span>
              <span className="text-[11px] leading-[14px] font-medium">
                <span className="block text-white">How to deposit?</span>
                <span className="block text-white/50">learn more →</span>
              </span>
            </button>
            {historyChains.length > 0 && (
              <div className="mt-4">
                <p className="mb-3 text-[13px] font-normal text-white/45">Search history</p>
                <div className="flex flex-wrap gap-3">
                  {historyChains.slice(0, 3).map((c) => (
                    <button
                      key={`h-${c.chainId}`}
                      onClick={() => selectChain(c)}
                      className={chipClass}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {c.logoUrl && <img src={c.logoUrl} alt="" className="size-4 rounded-full" />}
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {recommendedChains.length > 0 && (
              <div className="mt-4">
                <p className="mb-3 text-[13px] font-normal text-white/45">Recommended</p>
                <div className="flex flex-wrap gap-3">
                  {recommendedChains.map((c) => (
                    <button
                      key={`r-${c.chainId}`}
                      onClick={() => selectChain(c)}
                      className={chipClass}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {c.logoUrl && <img src={c.logoUrl} alt="" className="size-4 rounded-full" />}
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Networks or tokens, in the shell's own scroll rather than a second one. */}
      <div>
        {showingTokens ? (
          tokens.isPending ? (
            <div className="py-8 text-center text-[13px] text-white/40">Loading tokens…</div>
          ) : tokens.isError ? (
            <div className="py-8 text-center text-[13px] text-white/40">
              Couldn&apos;t load tokens.{" "}
              <button
                onClick={() => tokens.refetch()}
                className="text-accent cursor-pointer underline"
              >
                Try again
              </button>
            </div>
          ) : filteredTokenList.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-white/40">No tokens available</div>
          ) : (
            <div className="flex flex-col">
              {filteredTokenList.map((tk) => (
                <button
                  key={`${tk.chainId}:${tk.address}`}
                  onClick={() => setOriginToken(tk)}
                  className="-mx-1 flex w-full cursor-pointer items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <AssetIcon sym={tk.symbol} bg="#26262b" size={34} logo={tk.logoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] leading-[18px] font-semibold text-white">
                      {tk.symbol}
                    </span>
                    <span className="block truncate text-[12px] leading-[16px] font-normal text-white/50">
                      {tk.name}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )
        ) : (
          <NetworkList
            chains={filteredChains}
            selected={originChain}
            onSelect={selectChain}
            loading={chains.isPending}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "How to deposit?" — the whole thing in plain words, for someone who has
// never sent crypto. Reached from the card on the network step; the shell's
// Back returns there.
// ---------------------------------------------------------------------------

const HOW_TO_STEPS: { title: string; body: string }[] = [
  {
    title: "Pick the network you are sending from",
    body: "A network is the road your money travels on. Choose the same one your other app or exchange will send on. If you are not sure, Base is the cheapest and fastest.",
  },
  {
    title: "Pick the coin you are sending",
    body: "Any coin on the list works. Whatever you send arrives in your balance as US dollars, so you do not have to hold that coin afterwards.",
  },
  {
    title: "Copy the address we show you",
    body: "The address is where your money goes. Tap Copy Address, or scan the square code with the app you are sending from. The address is yours and you can use it again any time.",
  },
  {
    title: "Send from the other app",
    body: "Paste the address there, choose the same network you picked here, and send. Send at least a dollar's worth: smaller amounts can cost more to move than they are worth.",
  },
  {
    title: "Wait a moment",
    body: "Most deposits land in under a minute. You do not need to keep this screen open; your balance updates on its own.",
  },
];

function HowToDepositView() {
  return (
    <div className="flex flex-col">
      <h2 className="text-[18px] leading-[22px] font-semibold tracking-[-0.18px] text-white">
        How to deposit
      </h2>
      <p className="mt-1.5 text-[12px] leading-[16px] font-normal text-white/60">
        Sending money in takes five steps. Here they are in order.
      </p>

      <ol className="mt-4 flex flex-col gap-3">
        {HOW_TO_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex gap-3 rounded-[12px] border border-white/8 bg-white/[0.04] px-3.5 py-3"
          >
            <span className="tnum mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-semibold text-white/70">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] leading-[17px] font-semibold text-white">
                {step.title}
              </span>
              <span className="mt-1 block text-[12px] leading-[17px] font-normal text-white/60">
                {step.body}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 flex items-start gap-2 text-[12px] leading-[16px] font-normal text-white/50">
        <span aria-hidden className="mt-px shrink-0">
          ⚠️
        </span>
        <span>
          Send only the coin and network you picked. Anything sent on a different network can be
          lost, and it is not something we can undo.
        </span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Deposit address — only mounts when chain + token are both chosen.
// All wallet/address hooks live here so they don't crash the picker steps.
// ---------------------------------------------------------------------------

function DepositAddressView({
  chain,
  token,
  onBack,
}: {
  chain: DepositChain;
  token: DepositToken;
  onBack: () => void;
}) {
  const t = useTranslations("fundsFlow");
  const { user } = usePrivy();
  const { refetchFresh } = usePortfolio();

  const settlementAddress = getWalletAddress(user, settle.chainType);
  const family = originFamily(chain.chainId);
  const refType = family ? refundChainType(family) : null;
  const refundTo = refType ? getWalletAddress(user, refType) : null;
  const refundReady = family != null && (refundTo != null || isRefundOptional(family));

  const req: StaticAddressRequest | null =
    user?.id && settlementAddress && refundReady
      ? {
          userId: user.id,
          originChainId: chain.chainId,
          originAsset: token.address,
          settlementChainId: settle.chainId,
          settlementAsset: settle.usdc,
          settlementAddress,
          ...(refundTo ? { refundTo } : {}),
        }
      : null;

  const staticAddr = useStaticDepositAddress(req);

  // The address, the code and the warnings are the whole screen: it takes the
  // phone and fits inside it, so nobody has to scroll to reach the address.
  useModalScreen({ back: onBack, fullScreen: true, fits: true });

  useEffect(() => {
    if (staticAddr.isError) {
      track("deposit_failed", { method: "crypto", reason: "address_unavailable" });
    }
  }, [staticAddr.isError]);

  // Loading
  if (!staticAddr.data && !staticAddr.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        <p className="text-[13px] font-normal text-white/50">Creating deposit address…</p>
      </div>
    );
  }

  // Error
  if (staticAddr.isError || !staticAddr.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-[14px] font-medium text-white/70">
          Couldn&apos;t create deposit address
        </p>
        <p className="mt-2 text-[12px] text-white/40">
          {req
            ? "Please try again or choose a different token."
            : "Your wallet may not be ready yet."}
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onBack}
            className="cursor-pointer rounded-full border border-white/12 bg-white/6 px-5 py-2.5 text-[13px] font-medium text-white hover:bg-white/10"
          >
            Change token
          </button>
          {req && (
            <button
              onClick={() => staticAddr.refetch()}
              className="text-accent cursor-pointer rounded-full border border-white/12 bg-white/6 px-5 py-2.5 text-[13px] font-medium hover:bg-white/10"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // Success — show deposit details matching Figma
  const minimum = depositMinimumUsd(chain);
  const addr = staticAddr.data.depositAddress;
  const truncated = `${addr.slice(0, 6)}…${addr.slice(-20)}`;

  const copyAddress = () => {
    navigator.clipboard.writeText(addr).catch(() => {});
  };

  return (
    <div className="flex h-full flex-col">
      {/* Token title + network */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2">
          <AssetIcon sym={token.symbol} bg="#26262b" size={28} logo={token.logoUrl} />
          <h2 className="text-[20px] font-bold text-white">{token.symbol} -Deposit</h2>
        </div>
        <p className="mt-1.5 text-[13px] font-normal text-white/50">Network: {chain.name}</p>
      </div>

      {/* QR code with token icon centered — QrCode only, no address */}
      <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
        <div className="relative overflow-hidden rounded-[20px] bg-white p-4">
          <QrCode value={addr} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <AssetIcon sym={token.symbol} bg="white" size={40} logo={token.logoUrl} />
          </div>
        </div>
      </div>

      {/* Wallet address card */}
      <div className="mt-4 shrink-0 rounded-[14px] border border-white/12 bg-white/[0.04] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-white/70">Wallet Address &gt;</p>
            <p className="mt-1.5 truncate text-[13px] font-normal text-white/50">{truncated}</p>
          </div>
          <button
            onClick={copyAddress}
            className="ml-3 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/12 text-white/50 transition-colors hover:bg-white/8 hover:text-white"
            aria-label="Copy address"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Warning */}
      <div className="mt-2.5 flex shrink-0 items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-red-400/50 text-[8px] text-red-400">
          !
        </span>
        <p className="text-[13px] font-normal text-red-400">Do not send KASH+ to this address.</p>
      </div>

      {/* Minimum deposit */}
      <div className="mt-2.5 flex shrink-0 items-start gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-white/25 text-[8px] text-white/50">
          !
        </span>
        <p className="text-[13px] font-normal text-white/50">
          Minimum deposit is about{" "}
          <span className="tnum font-semibold text-white">${minimum}.</span> Smaller amounts may not
          be credited.
        </p>
      </div>

      {/* Waiting */}
      <div className="mt-3 flex shrink-0 items-center justify-center gap-2 text-[13px] font-normal text-white/50">
        <span className="bg-accent size-1.5 animate-pulse rounded-full" />
        Waiting for your deposit…
      </div>

      {/* Bottom buttons */}
      <div className="mt-3 flex shrink-0 gap-3">
        {/* <button className="flex-1 cursor-pointer rounded-full border border-white/20 py-3.5 text-[14px] font-semibold text-white/60 transition-colors hover:bg-white/6">
          Save Picture
        </button> */}
        <button
          onClick={copyAddress}
          className="flex-1 cursor-pointer rounded-full bg-[#5dd9a3] py-3 text-[14px] font-semibold text-black transition-opacity hover:opacity-90"
        >
          Copy Address
        </button>
      </div>
    </div>
  );
}
