"use client";

import { useState } from "react";
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
      <div className="p-5">
        <h2 className="font-sans text-[17px] font-semibold text-white">Share to Market Square</h2>
        <p className="mt-1 text-[13px] text-white/55">
          Add your own words. This posts as you, and anyone can open what it links to.
        </p>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, 2000))}
          placeholder="Say something about this…"
          aria-label="Your message"
          className="mt-4 h-24 w-full resize-none rounded-xl border border-white/12 bg-white/5 p-3 font-sans text-[14px] text-white outline-none placeholder:text-white/35 focus:border-violet-400/50"
        />

        {/* The card exactly as the square will render it. */}
        <div className="mt-3 overflow-hidden rounded-xl border border-white/12 bg-white/4">
          {draft.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.imageUrl} alt="" className="h-28 w-full object-cover" />
          ) : null}
          <div className="p-3">
            <p className="font-sans text-[14px] font-medium text-white">{draft.title}</p>
            {subtitle ? <p className="mt-0.5 text-[12.5px] text-white/55">{subtitle}</p> : null}
            <p className="mt-2 text-[11.5px] tracking-wide text-violet-300/80 uppercase">
              Opens in Ark
            </p>
          </div>
        </div>

        {draft.amount ? (
          <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[13px] text-white/70">
            <input
              type="checkbox"
              checked={withAmount}
              onChange={(event) => setWithAmount(event.target.checked)}
              className="size-4 accent-violet-500"
            />
            Include the amount ({draft.amount})
          </label>
        ) : null}

        {error ? <p className="mt-3 text-[13px] text-red-300">{error}</p> : null}
        {posted ? (
          <p className="mt-3 text-[13px] text-white/70">
            {posted}{" "}
            {squareUrl ? (
              <a href={squareUrl} className="text-violet-300 underline">
                Open Market Square
              </a>
            ) : null}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full px-4 py-2 text-[13.5px] text-white/70 hover:text-white"
          >
            {posted ? "Done" : "Cancel"}
          </button>
          {posted ? null : (
            <button
              type="button"
              onClick={() => void share()}
              disabled={posting}
              className="cursor-pointer rounded-full bg-violet-500 px-4 py-2 font-sans text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              {posting ? "Sharing…" : "Post"}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
