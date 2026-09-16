"use client";

import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { RwaIssuerCard } from "@/features/rwa/components/rwa-issuer-card";
import { useRwaTicket, type RwaTradeSide } from "@/features/rwa/hooks/use-rwa-ticket";
import { type RwaApiAsset } from "@/features/rwa/lib/api";
import { formatAmount, formatUsd } from "@/lib/trade/math";
import { chainLabel, gradientFor } from "@/features/rwa/lib/presenter";

// Quick-buy dollar amounts, matching the portfolio buy sheet.
const BUY_PRESETS = [10, 50, 100];
// Quick-sell fractions of the balance, matching the portfolio sell sheet.
const SELL_PRESETS = [0.25, 0.5, 1];

interface RwaTradePanelProps {
  asset: RwaApiAsset;
  // Drop the card chrome when rendered inside a modal, which already provides
  // its own sheet surface and padding.
  bare?: boolean;
  // Which side to open on. Defaults to buy; holdings open it on sell.
  initialMode?: RwaTradeSide;
  // Pre-fill the amount, e.g. from a spoken "buy $10 of Ondo". The user still
  // reviews and confirms, this only stages the form.
  initialAmount?: string;
  // Opens the deposit flow. An empty wallet is the most common reason a first
  // buy stalls, so the panel offers the way forward rather than a dead zero.
  onAddFunds?: () => void;
  // The Dextopus request is persisted at dashboard scope, so the user can
  // close this sheet after their source transfer is broadcast.
  onContinueInBackground?: () => void;
}

// Buy or sell surface for one RWA. Everything that is not markup, including
// both Solana settlement legs, lives in useRwaTicket. This panel opens on one
// side and never flips, which is what the modal that hosts it expects.
export function RwaTradePanel({
  asset,
  bare = false,
  initialMode = "buy",
  initialAmount = "",
  onAddFunds,
  onContinueInBackground,
}: RwaTradePanelProps) {
  const t = useTranslations("rwa");
  const tBuySell = useTranslations("buySell");
  const ticket = useRwaTicket({
    asset,
    initialSide: initialMode,
    initialAmount,
    onContinueInBackground,
  });
  const {
    isBuy,
    amount,
    setAmount,
    phase,
    quote,
    notice,
    signStep,
    confirm,
    reset,
    fillSellPct,
    fillSpendable,
    logo,
    sellBalance,
    spendableUsd,
    portfolioLoading,
    belowMin,
    minBuyUsd,
    overBalance,
    walletEmpty,
    sellable,
    sellBlocked,
    busy,
    canConfirm,
    needsBaseToSolanaFunding,
    canFundSolana,
    solanaFundingAmount,
    receiveEst,
    feeUsd,
    settlementRequest,
    settlementProgress,
    settlementBusy,
  } = ticket;

  if (ticket.issuerAccess) {
    return <RwaIssuerCard asset={asset} />;
  }

  const sellBlockedMessage = !sellable
    ? t("sellChains")
    : portfolioLoading
      ? t("checkingBalance")
      : t("noHoldingsToSell", { symbol: asset.symbol });

  const header = (
    <>
      <Eyebrow>{isBuy ? tBuySell("buy") : tBuySell("sell")}</Eyebrow>
      <div className="mt-3 flex items-center gap-[13px]">
        <AssetIcon sym={asset.symbol} bg={gradientFor(asset.symbol)} size={44} logo={logo} />
        <div className="min-w-0 flex-1">
          <div className="ws-display text-[22px]">{asset.name}</div>
          <div className="truncate text-[12.5px] font-normal text-white/50">
            {isBuy ? asset.symbol : `${asset.symbol} · ${chainLabel(asset.chain)}`}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div
      data-sensitive="position"
      data-broadcast-suspend
      className={
        bare
          ? ""
          : "ws-card p-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_70px_-30px_rgba(0,0,0,0.85)] sm:p-[22px]"
      }
    >
      {header}

      {sellBlocked ? (
        <div className="ws-inset mt-4 p-[18px] text-center">
          <div className="font-sans text-[14px] font-semibold text-white/85">
            {sellable
              ? t("noSymbolToSell", { symbol: asset.symbol })
              : t("sellingOnChain", { symbol: asset.symbol, chain: chainLabel(asset.chain) })}
          </div>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[12.5px] font-normal text-white/55">
            {sellBlockedMessage}
          </p>
        </div>
      ) : phase === "done" ? (
        <div className="ws-inset mt-4 p-[18px] text-center">
          <div className="text-up font-sans text-[15px] font-semibold">{t("orderFilled")}</div>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[12.5px] font-normal text-white/55">
            {isBuy ? t("buySettled", { name: asset.name }) : t("sellSettled", { name: asset.name })}
          </p>
          <button
            onClick={reset}
            className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-[13px] font-sans text-[14px] font-semibold hover:opacity-90"
          >
            {isBuy ? t("buyMore") : t("sellMore")}
          </button>
        </div>
      ) : (
        <>
          <div className="ws-inset mt-4 p-[15px]">
            <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
              <span>{isBuy ? tBuySell("amount") : tBuySell("amountToSell")}</span>
              {isBuy ? (
                <button
                  onClick={fillSpendable}
                  className="tnum cursor-pointer text-white/55 hover:text-white"
                >
                  {tBuySell("balanceUsd", { amount: formatAmount(spendableUsd) })}
                </button>
              ) : (
                <button
                  onClick={() => fillSellPct(1)}
                  className="tnum cursor-pointer text-white/55 hover:text-white"
                >
                  {t("balanceOf", { amount: formatAmount(sellBalance), symbol: asset.symbol })}
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              {isBuy ? <span className="ws-display text-[28px] text-white/70">$</span> : null}
              <input
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`ws-display tnum w-full min-w-0 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30 ${
                  isBuy ? "text-right" : ""
                }`}
              />
              {!isBuy ? (
                <span className="shrink-0 font-sans text-[14px] font-medium text-white/70">
                  {asset.symbol}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-2 flex gap-1.5">
            {isBuy
              ? BUY_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setAmount(String(p))}
                    className="flex-1 cursor-pointer rounded-[12px] border border-white/10 bg-white/4 py-2 font-sans text-[13px] font-medium text-white/75 transition-colors hover:bg-white/8"
                  >
                    ${p}
                  </button>
                ))
              : SELL_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => fillSellPct(pct)}
                    disabled={sellBalance <= 0}
                    className="flex-1 cursor-pointer rounded-[12px] border border-white/10 bg-white/4 py-2 font-sans text-[13px] font-medium text-white/75 transition-colors hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {pct === 1 ? tBuySell("max") : `${pct * 100}%`}
                  </button>
                ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-[13.5px] font-normal">
            <span className="text-white/55">{tBuySell("youGetAbout")}</span>
            <span className="tnum text-white">
              {receiveEst != null
                ? isBuy
                  ? `${formatAmount(receiveEst)} ${asset.symbol}`
                  : formatUsd(receiveEst)
                : "—"}
            </span>
          </div>

          {feeUsd != null && feeUsd > 0 ? (
            <div className="mt-2 flex items-center justify-between text-[13.5px] font-normal">
              <span className="text-white/55">{tBuySell("transactionFee")}</span>
              <span className="tnum text-white/75">≈ {formatUsd(feeUsd)}</span>
            </div>
          ) : null}

          {!isBuy ? (
            <p className="mt-2 text-[12px] leading-[1.5] font-normal text-white/45">
              {tBuySell("settlesToUsdc")}
            </p>
          ) : null}

          {notice ? (
            <div
              className={`mt-3.5 rounded-[12px] border p-3 text-[12.5px] font-medium ${
                notice.kind === "error"
                  ? "border-down/30 bg-down/10 text-down"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-200"
              }`}
            >
              {notice.message}
            </div>
          ) : null}
          {walletEmpty ? (
            <div className="mt-3.5 rounded-[12px] border border-white/12 bg-white/5 p-3">
              <div className="text-[12.5px] leading-[1.5] font-medium text-white/80">
                {t("noFundsTitle")}
              </div>
              <p className="mt-1 text-[11.5px] leading-[1.5] font-normal text-white/50">
                {t("noFundsBody")}
              </p>
              {onAddFunds ? (
                <button
                  onClick={onAddFunds}
                  className="text-ink mt-2.5 w-full cursor-pointer rounded-[12px] bg-white p-2.5 font-sans text-[13.5px] font-semibold hover:opacity-90"
                >
                  {t("addFunds")}
                </button>
              ) : null}
            </div>
          ) : needsBaseToSolanaFunding && !canFundSolana ? (
            <div className="mt-3.5 rounded-[12px] border border-white/12 bg-white/5 p-3">
              <div className="text-[12.5px] leading-[1.5] font-medium text-white/80">
                {t("fundSolanaShort")}
              </div>
              <p className="mt-1 text-[11.5px] leading-[1.5] font-normal text-white/50">
                {t("fundSolanaShortBody", { amount: formatUsd(solanaFundingAmount) })}
              </p>
            </div>
          ) : null}

          {settlementRequest ? (
            <div className="mt-3.5 rounded-[12px] border border-amber-400/30 bg-amber-400/10 p-3">
              <div className="text-[12.5px] leading-[1.5] font-medium text-amber-200">
                {settlementProgress?.label ??
                  (settlementRequest.direction === "base-to-solana"
                    ? t("fundSolanaWorking")
                    : t("proceedsBaseWorking"))}
              </div>
              <p className="mt-1 text-[11.5px] leading-[1.5] font-normal text-white/60">
                {settlementRequest.direction === "base-to-solana"
                  ? t("fundSolanaStatus")
                  : t("proceedsBaseStatus")}
              </p>
              {onContinueInBackground ? (
                <button
                  type="button"
                  onClick={onContinueInBackground}
                  className="mt-3 cursor-pointer rounded-[9px] border border-amber-200/25 px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-100 hover:bg-amber-100/10"
                >
                  {t("continueInBackground")}
                </button>
              ) : null}
            </div>
          ) : null}

          {!walletEmpty ? (
            <div className={`mt-4 flex gap-3 ${overBalance && onAddFunds ? "" : "flex-col"}`}>
              <button
                onClick={() => void confirm()}
                disabled={!canConfirm}
                className={`text-ink cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${overBalance && onAddFunds ? "flex-1" : "w-full"}`}
              >
                {busy
                  ? settlementBusy
                    ? settlementRequest?.direction === "solana-to-base"
                      ? t("proceedsBaseWorking")
                      : t("fundSolanaWorking")
                    : signStep
                      ? t("signingStep", { current: signStep.index + 1, total: signStep.total })
                      : t("buildingOrder")
                  : belowMin
                    ? tBuySell("minimumUsd", { amount: minBuyUsd })
                    : overBalance
                      ? tBuySell("notEnoughBalance")
                      : needsBaseToSolanaFunding
                        ? t("buySymbol", { symbol: asset.symbol })
                        : phase === "quoting"
                          ? t("fetchingBestPrice")
                          : quote
                            ? isBuy
                              ? t("buySymbol", { symbol: asset.symbol })
                              : t("sellSymbol", { symbol: asset.symbol })
                            : t("enterAmount")}
              </button>
              {overBalance && onAddFunds && (
                <button
                  onClick={onAddFunds}
                  className="flex-1 cursor-pointer rounded-[14px] border border-white/15 bg-white/5 p-3.5 font-sans text-[15px] font-semibold text-white transition-opacity hover:bg-white/10"
                >
                  {tBuySell("topUp")}
                </button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
