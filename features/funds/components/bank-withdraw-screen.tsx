"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { SheetNav } from "@/components/ui/sheet-nav";
import { MASK_ATTRIBUTE, NO_AUTOCAPTURE_CLASS } from "@/lib/analytics/clarity";
import { track } from "@/lib/analytics/mixpanel";
import { ArrowUpRightIcon, CheckIcon, SearchIcon, SwapIcon } from "@/components/ui/icons";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSendToken } from "@/hooks/use-withdraw";
import {
  useCreateOfframpOrder,
  useRampingBanks,
  useRampingRates,
  useRampOrder,
  useResolveBankAccount,
} from "@/hooks/use-ramping";
import { friendlyError } from "@/lib/errors";
import { getWalletAddress } from "@/lib/user";
import { formatAmount, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { SETTLE_CHAINS } from "@/lib/deposit";
import {
  idempotencyKey,
  isValidOfframpAmount,
  ngnForUsdcExact,
  OFFRAMP_MIN_USDC,
  usdcForNgnExact,
  type OfframpOrder,
  type RampBank,
} from "@/lib/ramping/orders";

interface BankWithdrawScreenProps {
  onBack: () => void;
}

const DECIMAL = /^\d*\.?\d*$/;
const BASE = SETTLE_CHAINS.base;

// The banks most users reach for, shown first and resolved against the live
// bank list by name. Everything else is one search away. Colours are just a
// recognisable tint for the avatar, not exact brand values.
const POPULAR = [
  { match: /^opay/i, label: "OPay", initials: "OP", color: "#12b76a" },
  { match: /palmpay/i, label: "PalmPay", initials: "PP", color: "#6d28d9" },
  { match: /^kuda/i, label: "Kuda", initials: "KU", color: "#5b21b6" },
  { match: /moniepoint/i, label: "Moniepoint", initials: "MP", color: "#0357ee" },
  { match: /guaranty trust|^gtbank/i, label: "GTBank", initials: "GT", color: "#e35205" },
  { match: /^access bank\b/i, label: "Access Bank", initials: "AC", color: "#f57e20" },
  { match: /^zenith/i, label: "Zenith Bank", initials: "ZE", color: "#e11900" },
  { match: /united bank for africa|^uba\b/i, label: "UBA", initials: "UB", color: "#c81e33" },
  {
    match: /first bank of nigeria|^firstbank/i,
    label: "First Bank",
    initials: "FB",
    color: "#0b3b8f",
  },
  { match: /^wema/i, label: "Wema Bank", initials: "WE", color: "#76287b" },
] as const;

const AVATAR_COLORS = [
  "#3b6ea5",
  "#8b5cf6",
  "#c2410c",
  "#0f766e",
  "#a21caf",
  "#b45309",
  "#2563eb",
  "#be123c",
  "#4d7c0f",
  "#0891b2",
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initialsForName(name: string): string {
  const words = name
    .replace(/[^\p{L}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const second = words[1]?.[0] ?? words[0]?.[1] ?? "";
  return (first + second).toUpperCase() || "?";
}

function formatNgn(amount: number): string {
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(amount);
}

// Group the integer part with commas for display, keeping any decimals as
// typed. The state holds the plain decimal string, so the real amount is what
// gets converted and sent. Mirrors the onramp's formatNgnInput.
function formatAmountInput(raw: string): string {
  if (!raw) return "";
  const [int, dec] = raw.split(".");
  const grouped = int === "" ? "" : new Intl.NumberFormat("en-US").format(BigInt(int));
  return raw.includes(".") ? `${grouped}.${dec ?? ""}` : grouped;
}

interface SelectedBank {
  uuid: string;
  // What the picker shows. The popular tiles use a short, recognisable label
  // ("OPay", "First Bank") rather than the registry's full legal name.
  name: string;
  /**
   * The bank registry's own name for the same institution.
   *
   * The two lists reached the same bank by different names: a popular tile
   * carried our label, a search result carried the registry's, so one bank
   * arrived at analytics as both "OPay" and "Opay" and split every breakdown
   * in two. This is the one name that is reported.
   */
  railName: string;
  initials: string;
  color: string;
}

function BankAvatar({
  initials,
  color,
  size = 34,
}: {
  initials: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-sans text-[12px] font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: color }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

// Withdraw USDC to a Nigerian bank over the ramping rail. The user picks a
// bank from the rail's live list, the account is verified automatically at ten
// digits, then the app opens an offramp order, sends USDC on Base to the
// order's deposit address, and the rail pays the Naira to the bank. The final
// Naira figure shown comes from the order once the rail reports it.
export function BankWithdrawScreen({ onBack }: BankWithdrawScreenProps) {
  const t = useTranslations("bankWithdraw");
  const { user } = usePrivy();
  const { tokens, refetch: refetchPortfolio } = usePortfolio();
  const { sendToken } = useSendToken();
  const walletAddress = getWalletAddress(user, "ethereum");

  const rates = useRampingRates();
  const banks = useRampingBanks(true);
  const resolve = useResolveBankAccount();
  const create = useCreateOfframpOrder();

  const [query, setQuery] = useState("");
  const [bank, setBank] = useState<SelectedBank | null>(null);
  const [account, setAccount] = useState("");
  // Users type Naira by default (the amount they want in their bank) and can
  // switch the entry to USDC. The withdrawal itself is always USDC.
  const [entry, setEntry] = useState<"ngn" | "usdc">("ngn");
  const [amountInput, setAmountInput] = useState("");
  const [creation, setCreation] = useState<OfframpOrder | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const usdc = tokens.find(
    (tk) => tk.network === BASE.alchemyNetwork && tk.symbol.toUpperCase() === "USDC"
  );
  const balance = usdc?.balance ?? 0;
  const exactBalance = usdc ? fromBaseUnits(BigInt(usdc.rawBalance), usdc.decimals) : "0";

  const verifiedName = resolve.data?.accountName ?? "";
  const rateStr = rates.data?.offrampRate ?? null;
  const ngnRate = rateStr ? Number(rateStr) : 0;
  const typed = Number(amountInput);
  // The USDC that actually leaves the balance, whichever currency is typed.
  // Naira entry converts through the exact bigint helper at the rail's own
  // truncation, so the figure never wobbles through floating point. A Naira
  // max converts back with rounding dust, so a sub-millionth overshoot counts
  // as the full balance instead of reading as over-balance.
  const typedUsdcExact =
    entry === "ngn" && rateStr && amountInput ? usdcForNgnExact(amountInput, rateStr) : null;
  let amount = entry === "usdc" ? typed : typedUsdcExact ? Number(typedUsdcExact) : NaN;
  const isFullBalance = Number.isFinite(amount) && amount > balance && amount - balance < 1e-6;
  if (isFullBalance) amount = balance;
  // The exact decimal string handed to the token transfer. Typed USDC is used
  // verbatim; converted Naira uses the exact 6-decimal figure, or the raw
  // balance when the amount is the full balance.
  const amountUsdcText =
    entry === "usdc" ? amountInput : isFullBalance ? exactBalance : (typedUsdcExact ?? "0");
  const validAmount = isValidOfframpAmount(amount, balance);
  const payoutNgn =
    rateStr && validAmount && amountUsdcText ? ngnForUsdcExact(amountUsdcText, rateStr) : null;
  const minNgn = ngnRate > 0 ? OFFRAMP_MIN_USDC * ngnRate : null;

  // Switching entry currency carries the typed value across at the live rate,
  // so the withdrawal the user is describing stays the same.
  const toggleEntry = () => {
    const next = entry === "ngn" ? "usdc" : "ngn";
    if (amountInput && Number.isFinite(typed) && typed > 0 && ngnRate > 0) {
      const converted = next === "usdc" ? typed / ngnRate : typed * ngnRate;
      const text = converted.toFixed(2);
      setAmountInput(text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text);
    }
    setEntry(next);
  };

  const orderQuery = useRampOrder("offramp", creation?.id ?? null, {
    enabled: Boolean(creation?.id),
    pollMs: 3000,
  });
  const order = (orderQuery.data as OfframpOrder | undefined) ?? creation;
  const done = order?.status === "completed";
  const payoutFailed = order?.status === "failed";
  // What reached the bank: the order's own figure once the rail reports it,
  // the pre-send estimate until then.
  const paidNgn = order?.amountNgn ?? payoutNgn;

  // Reported once on settlement, from the order's own figures. The amounts and
  // the rail, never the account it was paid into.
  const reportedComplete = useRef(false);
  useEffect(() => {
    if (!done || reportedComplete.current) return;
    // What the rail says it moved beats what was typed: a payout converts at
    // the rate that applied when it ran, which is not always the one quoted on
    // this screen.
    const usd = Number(order?.amountUsdc) || amount;
    const rate = Number(order?.rate) || ngnRate;
    const ngn = Number(paidNgn) || (rate > 0 ? usd * rate : 0);
    if (!(usd > 0) || !(ngn > 0)) {
      // A guessed figure on a money event is worse than a late one, and the
      // Naira leg is the whole point of reporting this rail. Stay quiet and let
      // a later poll, which will carry the order's figures, report it.
      console.warn("[analytics] bank withdrawal settled with no figures to report");
      return;
    }
    reportedComplete.current = true;
    // No recipient here, deliberately: a bank withdrawal's recipient is an
    // account number, which must never leave the app. The crypto rail sends
    // recipient_address because an on-chain address is public; this one has no
    // equivalent that is safe to send.
    track("withdraw_completed", {
      method: "bank",
      asset: "USDC",
      amount_usd: usd,
      // The net Naira that reached the account, and the rate the two legs
      // imply, so amount_ngn / fx_rate is always amount_usd. Two decimals, the
      // precision the rail quotes rates at. The rail reports no fee of its
      // own, so none is sent rather than a zero standing in.
      amount_ngn: ngn,
      fx_rate: Math.round((ngn / usd) * 100) / 100,
      // The registry's name, not the tile's label, so one bank is one row.
      bank: bank?.railName ?? "",
    });
  }, [done, order, paidNgn, amount, ngnRate, bank]);

  // Popular banks resolved to real uuids against the live list.
  const popularBanks = useMemo(() => {
    const list = banks.data ?? [];
    return POPULAR.map((p): SelectedBank | null => {
      const match = list.find((n) => p.match.test(n.name));
      return match
        ? {
            uuid: match.uuid,
            name: p.label,
            railName: match.name,
            initials: p.initials,
            color: p.color,
          }
        : null;
    }).filter((b): b is SelectedBank => b != null);
  }, [banks.data]);

  // Search the live list client-side; it is one fetch, cached for the session.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (banks.data ?? [])
      .filter((n: RampBank) => n.name.toLowerCase().includes(q))
      .slice(0, 40)
      .map((n: RampBank) => ({
        uuid: n.uuid,
        name: n.name,
        railName: n.name,
        initials: initialsForName(n.name),
        color: colorForName(n.name),
      }));
  }, [query, banks.data]);

  const pickBank = (b: SelectedBank) => {
    setBank(b);
    setQuery("");
    setAccount("");
    resolve.reset();
  };

  const onAccountChange = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, 10);
    setAccount(next);
    resolve.reset();
    // Verify as soon as a full account number is entered, no extra tap.
    if (bank && next.length === 10) {
      resolve.mutate({ accountNumber: next, bankUuid: bank.uuid });
    }
  };

  // Sent: the USDC transfer is on its way; the rail pays the bank next.
  if (txHash) {
    return (
      <div className="px-1 py-2 text-center">
        <span
          className={`inline-grid h-[56px] w-[56px] place-items-center rounded-full ${
            done
              ? "bg-accent/14 text-accent"
              : payoutFailed
                ? "bg-down/15 text-down"
                : "bg-white/8 text-white/70"
          }`}
        >
          <CheckIcon size={26} />
        </span>
        <div className="ws-display mt-4 text-[21px]">
          {done ? t("paidTitle") : payoutFailed ? t("payoutDelayedTitle") : t("sentTitle")}
        </div>
        <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-[1.55] font-normal text-white/60">
          {done
            ? t("paidBody", { amount: `₦${formatNgn(Number(paidNgn ?? 0))}` })
            : payoutFailed
              ? t("payoutDelayedBody", { amount: `₦${formatNgn(Number(paidNgn ?? 0))}` })
              : t("sentBody", { amount: `₦${formatNgn(Number(paidNgn ?? 0))}` })}
        </p>
        <a
          href={`https://basescan.org/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
        >
          {t("viewTransaction")}
          <ArrowUpRightIcon size={14} />
        </a>
        {!done && !payoutFailed ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-[12.5px] text-white/45">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            {t("settling")}
          </div>
        ) : null}
        <button
          onClick={() => {
            refetchPortfolio();
            onBack();
          }}
          className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          {t("finish")}
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!bank || !verifiedName || !validAmount || !walletAddress) return;
    setSendError(null);
    setSubmitting(true);
    let broadcasting = false;
    try {
      // A fresh key per press: retries inside the mutation replay the same
      // order, while a deliberate second withdrawal opens a new one.
      const result = await create.mutateAsync({
        originChainId: BASE.chainId,
        originAsset: BASE.usdc,
        expectedAmount: amountUsdcText,
        destinationAccount: account.trim(),
        destinationBankUuid: bank.uuid,
        idempotencyKey: idempotencyKey("offramp", walletAddress),
      });
      setCreation(result);
      if (!result.depositAddress) {
        setSendError(t("noAddress"));
        return;
      }
      broadcasting = true;
      const hash = await sendToken({
        network: BASE.alchemyNetwork,
        tokenAddress: BASE.usdc,
        decimals: BASE.decimals,
        to: result.depositAddress,
        amount: toBaseUnits(amountUsdcText, BASE.decimals),
      });
      setTxHash(hash);
    } catch (e) {
      // Past broadcast, a failure can't be reported as "not sent": the transfer
      // may already be on-chain. Surface an unconfirmed note instead.
      setSendError(broadcasting ? t("sendUnconfirmed") : friendlyError(e, t("createFailed")));
    } finally {
      setSubmitting(false);
    }
  };

  const ready =
    Boolean(bank) && Boolean(verifiedName) && Boolean(walletAddress) && validAmount && !submitting;

  return (
    <div>
      <SheetNav title={t("title")} subtitle={t("subtitle")} onBack={onBack} />

      {/* Step 1: bank */}
      {bank ? (
        <button
          onClick={() => {
            setBank(null);
            setAccount("");
            resolve.reset();
          }}
          className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] border border-white/10 bg-white/4 px-3.5 py-3 text-left transition-colors hover:bg-white/6"
        >
          <BankAvatar initials={bank.initials} color={bank.color} />
          <span className="min-w-0 flex-1 truncate font-sans text-[14.5px] font-medium text-white">
            {bank.name}
          </span>
          <span className="text-accent shrink-0 text-[12.5px] font-medium">{t("change")}</span>
        </button>
      ) : (
        <div>
          <label className="focus-within:border-accent/45 flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-black/35 px-3.5 py-3 transition-colors">
            <SearchIcon size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchBank")}
              className="w-full bg-transparent font-sans text-[14.5px] text-white outline-none placeholder:text-white/35"
            />
          </label>

          {banks.isPending ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[52px] animate-pulse rounded-[14px] bg-white/5" />
              ))}
            </div>
          ) : banks.isError ? (
            <div className="mt-3 rounded-[14px] border border-white/8 px-3.5 py-4 text-center">
              <p className="text-[13px] text-white/55">{t("banksFailed")}</p>
              <button
                onClick={() => banks.refetch()}
                className="mt-3 cursor-pointer rounded-[12px] border border-white/15 bg-white/8 px-4 py-2 font-sans text-[13px] font-medium text-white hover:bg-white/12"
              >
                {t("retry")}
              </button>
            </div>
          ) : query.trim() ? (
            // Search results across every bank.
            <div className="mt-3 overflow-hidden rounded-[14px] border border-white/8">
              {results.map((b) => (
                <button
                  key={b.uuid}
                  onClick={() => pickBank(b)}
                  className="flex w-full cursor-pointer items-center gap-3 border-b border-white/5 px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-white/6"
                >
                  <BankAvatar initials={b.initials} color={b.color} size={30} />
                  <span className="min-w-0 flex-1 truncate font-sans text-[13.5px] text-white/85">
                    {b.name}
                  </span>
                </button>
              ))}
              {results.length === 0 ? (
                <div className="px-3.5 py-4 text-center text-[13px] text-white/45">
                  {t("noBankMatch")}
                </div>
              ) : null}
            </div>
          ) : (
            // Popular banks as quick-pick tiles.
            <>
              <div className="mt-3.5 mb-2 text-[11.5px] font-medium tracking-[0.04em] text-white/40 uppercase">
                {t("popular")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {popularBanks.map((b) => (
                  <button
                    key={b.uuid}
                    onClick={() => pickBank(b)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[14px] border border-white/8 bg-white/4 px-3 py-2.5 text-left transition-colors hover:border-white/16 hover:bg-white/8"
                  >
                    <BankAvatar initials={b.initials} color={b.color} size={30} />
                    <span className="min-w-0 flex-1 truncate font-sans text-[13px] font-medium text-white">
                      {b.name}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-center text-[12px] font-normal text-white/40">
                {t("searchHint")}
              </p>
            </>
          )}
        </div>
      )}

      {/* Step 2: account number (auto-verifies at 10 digits) */}
      {bank ? (
        <div className="mt-3">
          <div className="mb-1.5 text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
            {t("accountLabel")}
          </div>
          <div className="focus-within:border-accent/45 flex items-center gap-2 rounded-[13px] border border-white/10 bg-black/35 px-3.5 transition-colors">
            <input
              {...MASK_ATTRIBUTE}
              inputMode="numeric"
              value={account}
              maxLength={10}
              onChange={(e) => onAccountChange(e.target.value)}
              placeholder="0123456789"
              className={`tnum w-full bg-transparent py-3 font-sans text-[14.5px] text-white outline-none placeholder:text-white/30 ${NO_AUTOCAPTURE_CLASS}`}
            />
            {resolve.isPending ? (
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            ) : verifiedName ? (
              <CheckIcon size={16} className="text-accent shrink-0" />
            ) : null}
          </div>
          {verifiedName ? (
            <div className="mt-1.5 font-sans text-[13px] font-medium text-white">
              {verifiedName}
            </div>
          ) : resolve.isError ? (
            <p className="text-down mt-1.5 text-[12.5px]">
              {friendlyError(resolve.error, t("verifyFailed"))}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Step 3: amount, typed in Naira or USDC with a pill toggle between. */}
      {verifiedName ? (
        <div className="ws-inset mt-3 p-[15px]">
          <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
            <span>{t("amountLabel")}</span>
            <button
              onClick={() => {
                if (entry === "usdc") setAmountInput(exactBalance);
                else if (ngnRate > 0) setAmountInput(String(Math.floor(balance * ngnRate)));
              }}
              className="tnum cursor-pointer text-white/55 hover:text-white"
            >
              {t("maxBalance", { amount: formatAmount(balance) })}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <input
              inputMode="decimal"
              value={formatAmountInput(amountInput)}
              onChange={(e) => {
                const raw = e.target.value.replace(/,/g, "");
                if (DECIMAL.test(raw)) setAmountInput(raw);
              }}
              placeholder={entry === "ngn" ? "0" : "0.00"}
              className="ws-display tnum w-full border-none bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
            />
            <button
              onClick={toggleEntry}
              aria-label={t("switchCurrency")}
              className="group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-3.5 py-2 font-sans text-[13.5px] font-medium text-white/85 transition-all duration-200 hover:border-white/22 hover:bg-white/10 hover:text-white active:scale-[0.96]"
            >
              <SwapIcon
                size={13}
                className="group-hover:text-accent text-white/45 transition-colors duration-200"
              />
              {entry === "ngn" ? "NGN" : "USD"}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/8 pt-2 text-[13px] font-normal text-white/55">
            <span>
              {amount > balance
                ? t("overBalance")
                : validAmount
                  ? entry === "ngn"
                    ? t("usdcEquivalent", { amount: formatAmount(amount) })
                    : t("youReceive", { amount: `₦${formatNgn(Number(payoutNgn ?? 0))}` })
                  : entry === "ngn" && minNgn != null
                    ? t("enterMinNgn", { amount: `₦${formatNgn(minNgn)}` })
                    : t("enterMin", { amount: OFFRAMP_MIN_USDC })}
            </span>
            {ngnRate > 0 ? (
              <span className="tnum shrink-0 text-white/45">
                {t("rateLine", { rate: `₦${formatNgn(ngnRate)}` })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {sendError ? <p className="text-down mt-3 text-[13px]">{sendError}</p> : null}

      {verifiedName ? (
        <button
          onClick={submit}
          disabled={!ready}
          className="text-ink mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <>
              <span className="border-ink/30 border-t-ink h-4 w-4 animate-spin rounded-full border-2" />
              {t("processing")}
            </>
          ) : (
            t("withdraw")
          )}
        </button>
      ) : null}
    </div>
  );
}
