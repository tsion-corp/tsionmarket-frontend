"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/ui/sheet-nav";
import { NetworkTabs } from "@/features/funds/components/network-tabs";
import { TokenList } from "@/features/funds/components/token-list";
import { AddressPanel } from "@/features/funds/components/address-panel";
import { AssetIcon } from "@/components/ui/asset-icon";
import { friendlyError } from "@/lib/errors";
import { track } from "@/lib/analytics/mixpanel";
import {
  isRetryableDextopusError,
  useDepositChains,
  useDepositTokens,
  useEligibleOriginChainIds,
  useStaticDepositAddress,
} from "@/hooks/use-deposit";
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
import { matchDepositChain } from "@/lib/voice/chain-match";
import type { DepositPrefill } from "@/lib/voice/intent";

interface CryptoDepositScreenProps {
  onBack: () => void;
  // Optional voice prefill: pre-select this chain (and token, when it matches).
  initialDeposit?: DepositPrefill;
}

// Deposits always settle to USDC on Base, so every user gets one deposit
// address per origin token regardless of which chain they send from.
const settle = SETTLE_CHAINS.base;

export function CryptoDepositScreen({ onBack, initialDeposit }: CryptoDepositScreenProps) {
  const t = useTranslations("fundsFlow");
  const { user } = usePrivy();
  const { refetch } = usePortfolio();

  const [originChain, setOriginChain] = useState<DepositChain | null>(null);
  const [originToken, setOriginToken] = useState<DepositToken | null>(null);

  const chains = useDepositChains();
  const eligibleChains = useEligibleOriginChainIds();
  const tokens = useDepositTokens(originChain?.chainId ?? null);

  // Resolve the spoken chain NAME against Dextopus's live chain list (any chain
  // the user said — never a hardcoded subset). null when it doesn't match one we
  // offer, in which case we just leave the picker for the user. MEMOIZED so it is
  // a STABLE reference across renders — otherwise the prefill effect below re-ran
  // every render (a new object each time) and thrashed the component.
  const prefillChain = useMemo(
    () => (initialDeposit ? matchDepositChain(initialDeposit.chain, chains.data) : null),
    [initialDeposit, chains.data]
  );

  // Apply the voice prefill once the async lists arrive: select the matched
  // chain, then its token. A legitimate external-sync effect (URL/data → local
  // picker state, one-shot via refs), so once a user touches the picker they are
  // never overridden.
  const prefilledChain = useRef(false);
  const prefilledToken = useRef(false);
  useEffect(() => {
    if (prefilledChain.current || !prefillChain) return;
    prefilledChain.current = true;
    setOriginChain(prefillChain);
  }, [prefillChain]);
  useEffect(() => {
    if (prefilledToken.current || !initialDeposit?.token || !tokens.data) return;
    if (!prefillChain || originChain?.chainId !== prefillChain.chainId) return;
    const want = initialDeposit.token.toUpperCase();
    const match = tokens.data.find((t) => t.symbol.toUpperCase() === want);
    if (match) {
      prefilledToken.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOriginToken(match);
    }
  }, [initialDeposit, prefillChain, originChain, tokens.data]);

  const settlementAddress = getWalletAddress(user, settle.chainType);

  // A static address wants a refund address on the origin's own VM family.
  // Where we hold a wallet on that family it is sent; for refund-optional
  // families (Bitcoin) the field is omitted and Dextopus refunds to the
  // account's dashboard-configured default address instead.
  const family = originChain ? originFamily(originChain.chainId) : null;
  const refundType = family ? refundChainType(family) : null;
  const refundTo = refundType ? getWalletAddress(user, refundType) : null;
  const refundReady = family != null && (refundTo != null || isRefundOptional(family));

  const req: StaticAddressRequest | null =
    user?.id && originChain && originToken && settlementAddress && refundReady
      ? {
          userId: user.id,
          originChainId: originChain.chainId,
          originAsset: originToken.address,
          settlementChainId: settle.chainId,
          settlementAsset: settle.usdc,
          settlementAddress,
          ...(refundTo ? { refundTo } : {}),
        }
      : null;

  const staticAddr = useStaticDepositAddress(req);

  const resetToken = () => setOriginToken(null);

  // Address view: a token is picked and its permanent address has been minted.
  if (originToken && originChain && staticAddr.data) {
    const minimum = depositMinimumUsd(originChain);
    return (
      <div>
        <SheetNav title={t("fundWithToken", { symbol: originToken.symbol })} onBack={onBack} />

        {/* Selected token + chain, with a one-tap way back to change it. */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <AssetIcon sym={originToken.symbol} bg="#26262b" size={26} logo={originToken.logoUrl} />
            <span className="min-w-0 truncate text-[14px] font-medium text-white">
              {t.rich("tokenOnChain", {
                symbol: originToken.symbol,
                chain: originChain.name,
                muted: (chunks) => <span className="font-normal text-white/45">{chunks}</span>,
              })}
            </span>
          </span>
          <button
            onClick={resetToken}
            className="text-accent shrink-0 cursor-pointer text-[13px] font-semibold hover:underline"
          >
            {t("change")}
          </button>
        </div>

        <AddressPanel
          address={staticAddr.data.depositAddress}
          tokenSymbol={originToken.symbol}
          chainName={originChain.name}
        />

        {/* Minimum-deposit caution, styled as a warning banner. */}
        <div className="mt-3 flex items-start gap-2.5 rounded-[14px] border border-[#d8d8dc]/25 bg-[#d8d8dc]/8 px-4 py-3">
          <span aria-hidden className="mt-px shrink-0 text-[15px]">
            ⚠️
          </span>
          <p className="text-[12.5px] leading-normal font-normal text-white/80">
            {t.rich("minimumDeposit", {
              amount: minimum,
              strong: (chunks) => <span className="tnum font-semibold text-white">{chunks}</span>,
            })}{" "}
            <span className="text-white/55">{t("minimumDepositNote")}</span>
          </p>
        </div>

        {/* Live pending indicator — the static address credits automatically. */}
        <div className="mt-3 flex items-center justify-center gap-2 text-[13px] font-normal text-white/55">
          <span className="bg-accent h-1.5 w-1.5 animate-pulse rounded-full" />
          {t("waitingForDeposit")}
        </div>

        <div className="ws-inset mt-3 px-4 py-3">
          <p className="text-[12.5px] leading-normal font-normal text-white/70">
            {t.rich("depositNote", {
              symbol: originToken.symbol,
              chain: originChain.name,
              strong: (chunks) => <span className="font-semibold text-white">{chunks}</span>,
            })}
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="mt-3 w-full cursor-pointer rounded-[14px] border border-white/12 bg-white/5 p-3 font-sans text-[14px] font-medium text-white hover:bg-white/10"
        >
          {t("refreshBalance")}
        </button>
      </div>
    );
  }

  // Picker view: choose where to settle, then origin network + token.
  return (
    <div>
      <SheetNav
        title={t("depositCryptoTitle")}
        subtitle={t("depositCryptoSubtitle")}
        onBack={onBack}
      />

      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-2 text-xs font-normal text-white/55">{t("fromNetwork")}</div>
          <NetworkTabs
            chains={chains.data ?? []}
            eligibleChainIds={eligibleChains.data ?? new Set()}
            selectedId={originChain?.chainId ?? null}
            onSelect={(c) => {
              track("deposit_network_selected", { network: c.name });
              setOriginChain(c);
              setOriginToken(null);
            }}
            loading={chains.isPending || eligibleChains.isPending}
            error={chains.isError || eligibleChains.isError}
            onRetry={() => {
              chains.refetch();
              eligibleChains.refetch();
            }}
          />
        </div>

        {originChain ? (
          <div>
            <div className="mb-2 text-xs font-normal text-white/55">{t("tokenToSend")}</div>
            <TokenList
              tokens={tokens.data ?? []}
              selected={originToken}
              onSelect={setOriginToken}
              loading={tokens.isPending}
              error={tokens.isError}
              onRetry={() => tokens.refetch()}
            />
          </div>
        ) : null}

        {req && staticAddr.isPending ? (
          <div className="py-4 text-center text-[13px] font-normal text-white/55">
            {t("creatingDepositAddress")}
          </div>
        ) : null}

        {req && staticAddr.isError ? (
          <div className="text-down text-[13px] font-normal">
            {friendlyError(staticAddr.error, t("depositAddressError"))}{" "}
            {isRetryableDextopusError(staticAddr.error) ? (
              <button
                onClick={() => staticAddr.refetch()}
                className="text-accent cursor-pointer underline"
              >
                {t("tryAgain")}
              </button>
            ) : (
              <button onClick={resetToken} className="text-accent cursor-pointer underline">
                {t("chooseDifferentToken")}
              </button>
            )}
          </div>
        ) : null}

        {originToken && !settlementAddress ? (
          <div className="border-down/25 bg-down/10 rounded-[14px] border px-4 py-3 text-[12.5px] font-normal text-white/70">
            {t("needSettlementWallet", { chain: settle.chainName })}
          </div>
        ) : null}

        {originToken && settlementAddress && !refundReady ? (
          <div className="border-down/25 bg-down/10 rounded-[14px] border px-4 py-3 text-[12.5px] font-normal text-white/70">
            {refundType === "solana"
              ? t("needRefundAddressSolana", { chain: originChain?.name ?? "" })
              : t("needRefundAddressWallet", { chain: originChain?.name ?? "" })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
