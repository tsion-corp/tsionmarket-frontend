"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/ui/icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { createPost, type MarketSquareDeepLink } from "@/lib/api/market-square";
import { marketSquareHref } from "@/lib/market-square";
import { shareErrorMessage } from "@/lib/square/share-error";

/**
 * Share an Ark activity into Market Square.
 *
 * The square is the platform's social surface but cannot describe what happens
 * inside the products — a trade, a position, a game result all live in
 * services it must not read. So the surface that did the thing describes it,
 * and this sheet is where the user sees exactly what will be posted before it
 * is.
 *
 * It NEVER posts on its own. Everything here is a draft the user edits and
 * confirms, because a platform that publishes your activity without asking is
 * a different product from one that lets you share it.
 */
export interface ShareDraft {
  /** What the card says happened. Never money on its own — see `amount`. */
  title: string;
  subtitle?: string;
  imageUrl?: string;
  /** Where the card leads. Without it there is nothing to share. */
  deepLink: MarketSquareDeepLink;
  /** Prefills the composer; the user rewrites it freely. */
  suggestedText?: string;
  /**
   * The figure, kept SEPARATE from the card and off by default.
   *
   * On a trading platform one careless tap should not publish a position size
   * to strangers, so the amount is something the user opts into after seeing
   * it, not something that rides along because the sharing code happened to
   * know it.
   */
  amount?: string;
}

export function ShareToSquare({
  draft,
  open,
  onClose,
}: {
  draft: ShareDraft;
  open: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState(draft.suggestedText ?? "");
  const [withAmount, setWithAmount] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);

  const subtitle =
    withAmount && draft.amount
      ? [draft.subtitle, draft.amount].filter(Boolean).join(" · ")
      : draft.subtitle;

  async function share() {
    setPosting(true);
    setError(null);
    try {
      const { previewShared } = await createPost({
        text: text.trim() === "" ? draft.title : text.trim(),
        deepLink: draft.deepLink,
        preview: { title: draft.title, subtitle, imageUrl: draft.imageUrl },
      });
      // Say so rather than letting the user believe they shared a card they
      // did not: a deployment without preview support drops it silently.
      setPosted(
        previewShared
          ? "Shared to Market Square."
          : "Shared — this deployment posted the link only."
      );
    } catch (failure) {
      // Named, not flattened: the cause is always on the other side of a
      // deployment boundary, so a generic sentence leaves the reader with
      // nothing to act on and us with nothing to diagnose.
      setError(shareErrorMessage(failure));
    } finally {
      setPosting(false);
    }
  }

  const squareUrl = marketSquareHref();

  return (
    <ModalShell open={open} onClose={onClose}>
      {/* ModalShell already pads the panel and draws its own close button, so
          nothing here adds padding of its own. The heading just keeps clear of
          that button. */}
      <div className="pr-10">
        <h2 className="ws-display text-[21px] tracking-[-0.01em]">Share to Market Square</h2>
        <p className="mt-1.5 text-[13px] font-normal text-white/55">
          Add your own words. This posts as you, and anyone can open what it links to.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value.slice(0, 2000))}
        placeholder="Say something about this…"
        aria-label="Your message"
        className="mt-4 h-24 w-full resize-none rounded-xl border border-white/12 bg-white/5 p-3.5 font-sans text-[14px] text-white transition-colors outline-none placeholder:text-white/35 focus:border-white/28 focus:bg-white/[0.07]"
      />

      {/* The card exactly as the square will render it, labelled so it reads as
          a preview rather than another field to fill in. */}
      <p className="mt-4 text-[11.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
        Preview
      </p>
      <div className="mt-2 overflow-hidden rounded-xl border border-white/12 bg-white/4">
        {draft.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.imageUrl} alt="" className="h-28 w-full object-cover" />
        ) : null}
        <div className="p-3.5">
          <p className="font-sans text-[14px] font-medium text-white">{draft.title}</p>
          {subtitle ? (
            <p className="tnum mt-0.5 text-[12.5px] font-normal text-white/55">{subtitle}</p>
          ) : null}
          {/* The one violet touch in the sheet: it marks the Market Square
              destination, the same accent the square carries in the nav. */}
          <span className="mt-2.5 inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/12 px-2.5 py-1 text-[10.5px] font-medium tracking-[0.04em] text-violet-200 uppercase">
            Opens in Ark
          </span>
        </div>
      </div>

      {draft.amount ? (
        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3.5 py-3 transition-colors hover:bg-white/6">
          {/* The native control keeps the semantics and the keyboard behaviour;
              the span beside it carries the look, since a checkbox cannot be
              styled to match the sheet. The tick is drawn in currentColor, so
              flipping the span's text colour is what reveals it. */}
          <input
            type="checkbox"
            checked={withAmount}
            onChange={(event) => setWithAmount(event.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="peer-checked:text-ink grid size-[19px] shrink-0 place-items-center rounded-[7px] border border-white/22 bg-white/6 text-transparent transition-colors peer-checked:border-white peer-checked:bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-white/40"
          >
            <CheckIcon size={13} />
          </span>
          <span className="text-[13px] font-normal text-white/70">
            Include the amount ({draft.amount})
          </span>
        </label>
      ) : null}

      {error ? <p className="mt-3 text-[13px] font-normal text-red-300">{error}</p> : null}
      {posted ? (
        <p className="mt-3 text-[13px] font-normal text-white/70">
          {posted}{" "}
          {squareUrl ? (
            <a href={squareUrl} className="text-white underline underline-offset-2">
              Open Market Square
            </a>
          ) : null}
        </p>
      ) : null}

      <div className="mt-5 flex items-center gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 cursor-pointer rounded-full border border-white/12 bg-white/5 px-4 py-3 font-sans text-[14.5px] font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
        >
          {posted ? "Done" : "Cancel"}
        </button>
        {posted ? null : (
          <button
            type="button"
            onClick={() => void share()}
            disabled={posting}
            className="ws-chrome text-ink flex-1 cursor-pointer rounded-full bg-white px-4 py-3 font-sans text-[14.5px] font-semibold hover:opacity-90 disabled:cursor-default disabled:opacity-40"
          >
            {posting ? "Sharing…" : "Post"}
          </button>
        )}
      </div>
    </ModalShell>
  );
}
