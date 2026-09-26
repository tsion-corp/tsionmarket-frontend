"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import { friendlyError } from "@/lib/errors";
import { SheetNav } from "@/components/ui/sheet-nav";
import { useVaultActions } from "@/features/casino/hooks/use-vault-actions";
import { useGameBalance } from "@/features/casino/hooks/use-game-balance";
import { useVaultGame } from "@/features/casino/hooks/use-vault-game";
import {
  DESCRIPTION_MAX,
  metadataProblem,
  TITLE_MAX,
} from "@/features/casino/lib/last-standing/game-metadata";
import { useDefaultEntry } from "@/features/casino/hooks/use-default-entry";
import { followGame } from "@/features/casino/lib/last-standing/followed-game";
import { markPrivate } from "@/features/casino/lib/last-standing/visibility";
import { GameShareCard } from "@/features/casino/components/last-standing/game-share-card";
import {
  GAME_ASSET,
  formatGameAmount,
  stakeToSend,
  unitsToUsd,
  usdToUnits,
} from "@/features/casino/lib/last-standing/stake";

interface StartGameSheetProps {
  onClose: () => void;
  onStarted: () => void;
  /** Last look before the transaction: resolves false to abort the start
   *  (e.g. another game went live while the sheet was open). */
  ensureCanStart?: () => Promise<boolean>;
  /** Formats a USD figure in the currency the user picked. */
  formatUsd: (usd: number) => string;
  /** Opens funding when the wallet is short on ETH; without it the CTA just says so. */
  onFund?: () => void;
  /** False when a public game already holds the lobby slot. */
  canStartPublic?: boolean;
}

type Visibility = "public" | "private";

export function StartGameSheet({
  onClose,
  onStarted,
  formatUsd,
  onFund,
  ensureCanStart,
  canStartPublic = true,
}: StartGameSheetProps) {
  const t = useTranslations("casino.lastStanding");
  const router = useRouter();
  const { startGame, starting, startPhase } = useVaultActions();
  // Seeds the new game's caches from the service (which reads the contract
  // for a game its index has not reached), so the page they land on has the
  // round the moment it opens rather than a 404 from a lagging index.
  const { confirmGame } = useVaultGame(null);

  // Null until they type: the field shows the cheapest stake the contract will
  // actually accept, which is not always our preferred figure.
  const [edited, setEdited] = useState<string | null>(null);
  // The game's name. Optional, cosmetic, and never a reason the game does not
  // open: metadataProblem only decides whether there is anything worth sending.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Private by default when the lobby slot is taken: that is the only choice
  // available then, so it should be the one already selected.
  const [visibility, setVisibility] = useState<Visibility>(canStartPublic ? "public" : "private");
  // Set once the game exists, which swaps the form for the share card rather
  // than navigating away from the link the starter now needs.
  const [started, setStarted] = useState<number | null>(null);

  // The contract's floor for the asset we play in, from the same hook the lobby
  // button reads, so the sheet can only ever quote what the button promised.
  const { usd: defaultEntry, floorUnits, floorFailed } = useDefaultEntry();

  // What the wallet needs to hold. The stake is USDC, which is the spendable
  // balance itself, so there is nothing to convert and nothing to top up.
  const { balanceUsd, settle: settleBalance } = useGameBalance();

  // The default is the greater of our preferred entry and the contract's floor,
  // so the field and the button always agree. Lower the floor on-chain and this
  // drops back to the preferred entry on its own.
  const usd = edited ?? (defaultEntry !== null ? defaultEntry.toFixed(2) : "");

  // A dollar figure IS the amount: no price, so nothing can move between the
  // number on screen and the number that is sent.
  const wanted = useMemo(() => usdToUnits(Number(usd)), [usd]);
  const send = useMemo(
    () => (floorUnits === null ? 0n : stakeToSend(wanted, floorUnits)),
    [wanted, floorUnits]
  );
  // They typed something under the floor, so the sheet says the number moved
  // rather than quietly charging more than the button promised.
  const liftedToFloor = floorUnits !== null && wanted > 0n && send > wanted;
  const sendUsd = unitsToUsd(send);
  const shortOnBalance = send > 0n && balanceUsd < sendUsd;

  const ready = send > 0n && !starting && !floorFailed && !shortOnBalance;

  const confirm = async () => {
    if (!ready) return;
    try {
      // Only a public game competes for the lobby slot; a private one never
      // does, so it is never blocked by a game already running.
      if (visibility === "public" && ensureCanStart && !(await ensureCanStart())) {
        toast.error(t("toastStartBlockedLive"));
        onClose();
        return;
      }
      const metadata =
        metadataProblem({ title, description }) === null ? { title, description } : undefined;
      const { gameId } = await startGame(send, metadata, visibility === "private");
      // The stake has left the wallet: show it gone now, confirm from Base once.
      void settleBalance();
      // The pop-out timer follows whatever you last put money into.
      if (gameId !== null) {
        followGame(gameId);
        if (visibility === "private") markPrivate(gameId);
        // Opening a round, which is a different act from buying into one: the
        // starter takes a share of the pot. A round the contract did not give
        // an id to cannot be joined to anything, so it is not reported.
        track("last_man_created", { game_id: String(gameId), entry_fee_usd: sendUsd });
      }
      track("game_staked", { game: "last_man", amount_usd: sendUsd });
      toast.success(t("toastGameStarted"));
      // A second or two at most, and only when the index trails the receipt.
      if (gameId !== null) await confirmGame(gameId);
      onStarted();
      // The link and its code come first: at a stand the next thing that
      // happens is somebody scanning it, not the starter watching the clock.
      if (gameId !== null) setStarted(gameId);
      else onClose();
    } catch (error) {
      toast.error(friendlyError(error, t("toastStartFailed")));
    }
  };

  if (started !== null) {
    const url = `${typeof window === "undefined" ? "" : window.location.origin}/casino/last-standing/${started}`;
    return (
      <div>
        <SheetNav title={t("shareNavTitle")} onBack={onClose} />
        <div className="mt-3">
          <GameShareCard
            gameId={started}
            url={url}
            stakeLabel={t("shareStake", { amount: formatUsd(sendUsd) })}
            isPrivate={visibility === "private"}
            onOpen={() => {
              router.push(`/casino/last-standing/${started}`);
              onClose();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <SheetNav title={t("startTitle")} onBack={onClose} />

      <p className="text-[13.5px] leading-relaxed font-normal text-white/60">{t("startBody")}</p>

      <label className="mt-5 block">
        <span className="text-[11.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
          {t("startStakeLabel")}
        </span>
        <span className="focus-within:border-accent/45 mt-2 flex items-center gap-2 rounded-[13px] border border-white/10 bg-black/35 px-3.5 transition-colors">
          <span className="text-[15px] font-medium text-white/45">$</span>
          <input
            inputMode="decimal"
            value={usd}
            onChange={(e) => {
              if (/^\d*\.?\d*$/.test(e.target.value)) setEdited(e.target.value);
            }}
            className="tnum w-full bg-transparent py-3 font-sans text-[15px] text-white outline-none placeholder:text-white/30"
          />
          <span className="tnum shrink-0 text-[12.5px] font-normal text-white/40">
            {send > 0n ? `${formatGameAmount(send)} ${GAME_ASSET.symbol}` : "—"}
          </span>
        </span>
      </label>

      <p className="mt-2 text-[12px] leading-relaxed font-normal text-white/45">
        {t("startStakeNote")}
      </p>

      {liftedToFloor ? (
        <p className="mt-2 text-[12px] leading-relaxed font-normal text-white/70">
          {t("startFloorRaised", { amount: formatUsd(sendUsd) })}
        </p>
      ) : null}

      {floorFailed ? (
        <p className="mt-2 text-[12px] leading-relaxed font-normal text-[#e3a49a]">
          {t("startFloorUnavailable")}
        </p>
      ) : shortOnBalance ? (
        <p className="mt-2 text-[12px] leading-relaxed font-normal text-[#e3a49a]">
          {t("startNeedsBalance", { amount: formatUsd(sendUsd) })}
        </p>
      ) : null}

      {/* The game's name. Sent after the transaction and keyed on its hash, so
          nothing here can stop a game opening. Both fields are capped at the
          service's own limits, which is why the counters are the service's
          constants rather than numbers typed here. */}
      <label className="mt-5 block">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[11.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
            {t("nameLabel")}
          </span>
          <span className="text-[11px] font-normal text-white/30">{t("nameOptional")}</span>
        </span>
        <span className="focus-within:border-accent/45 mt-2 flex items-center gap-2 rounded-[13px] border border-white/10 bg-black/35 px-3.5 transition-colors">
          <input
            value={title}
            maxLength={TITLE_MAX}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent py-3 font-sans text-[15px] text-white outline-none placeholder:text-white/30"
          />
          {title.length > 0 ? (
            <span className="tnum shrink-0 text-[12px] font-normal text-white/35">
              {TITLE_MAX - title.length}
            </span>
          ) : null}
        </span>
      </label>

      <p className="mt-2 text-[12px] leading-relaxed font-normal text-white/45">{t("nameNote")}</p>

      {/* The description follows the title rather than sitting beside it: it is
          only worth typing once the game has a name, and an empty one is
          dropped before anything is signed. */}
      {title.trim().length > 0 ? (
        <label className="mt-4 block">
          <span className="text-[11.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
            {t("descriptionLabel")}
          </span>
          <span className="focus-within:border-accent/45 mt-2 flex items-start gap-2 rounded-[13px] border border-white/10 bg-black/35 px-3.5 transition-colors">
            <textarea
              rows={2}
              value={description}
              maxLength={DESCRIPTION_MAX}
              placeholder={t("descriptionPlaceholder")}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none bg-transparent py-3 font-sans text-[14px] leading-[1.5] text-white outline-none placeholder:text-white/30"
            />
          </span>
        </label>
      ) : null}

      {/* Who can find the game. The contract does not know the difference, so
          this is about the lobby listing, and the copy says exactly that. */}
      <div className="mt-5">
        <span className="text-[11.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
          {t("visibilityLabel")}
        </span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["public", "private"] as const).map((option) => {
            const selected = visibility === option;
            const blocked = option === "public" && !canStartPublic;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                disabled={blocked}
                onClick={() => setVisibility(option)}
                className={
                  "cursor-pointer rounded-[13px] border px-3.5 py-3 text-left transition-colors " +
                  "disabled:cursor-not-allowed disabled:opacity-40 " +
                  (selected
                    ? "border-accent/50 bg-accent/[0.09]"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]")
                }
              >
                <span
                  className={
                    "block text-[13.5px] font-semibold " + (selected ? "text-accent" : "text-white")
                  }
                >
                  {t(option === "public" ? "visibilityPublic" : "visibilityPrivate")}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.45] font-normal text-white/50">
                  {t(
                    blocked
                      ? "visibilityPublicTaken"
                      : option === "public"
                        ? "visibilityPublicNote"
                        : "visibilityPrivateNote"
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Short on ETH with a way to fund: the button becomes the way. */}
      {shortOnBalance && !floorFailed && !starting && onFund ? (
        <button
          type="button"
          onClick={onFund}
          className="bg-accent mt-5 w-full cursor-pointer rounded-[13px] py-3.5 text-[14.5px] font-semibold text-black"
        >
          {t("addMoney")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={!ready}
          className="bg-accent mt-5 w-full cursor-pointer rounded-[13px] py-3.5 text-[14.5px] font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {starting ? (
            // A spinner beside the label, because the two phases below can run
            // for ten seconds or more and a button that only changes its words
            // reads as one that has stopped responding. aria-live announces the
            // change once rather than on every render.
            <span className="flex items-center justify-center gap-2" aria-live="polite">
              <span
                aria-hidden="true"
                className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-black/25 border-t-black"
              />
              {t(startPhase === "confirming" ? "startConfirming" : "startSending")}
            </span>
          ) : floorFailed ? (
            t("startUnavailable")
          ) : shortOnBalance ? (
            t("startNeedsBalanceCta")
          ) : send > 0n ? (
            t("startCta", { amount: formatUsd(sendUsd) })
          ) : (
            t("loading")
          )}
        </button>
      )}
    </div>
  );
}
