"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ModalShell } from "@/components/ui/modal-shell";
import { createSquarePost, fetchSquareTopics } from "@/lib/api/market-square";
import { squareLinks } from "@/lib/square/links";
import { COUNTER_VISIBLE_FROM, canPost, remaining } from "@/lib/square/compose";
import { ComposerTools } from "@/components/share/composer-tools";
import { insertSymbol } from "@/lib/square/insert-symbol";
import type { TradableSymbol } from "@/lib/square/tradable";

/**
 * Posting to the square without leaving Ark.
 *
 * The plus used to be a link to the square's own composer, which meant leaving
 * the dashboard, landing on another deployment and signing in again to say one
 * sentence — enough friction that nobody would. Posting is the one write Ark's
 * proxy already relays, so there was never a reason to send people away.
 *
 * It is deliberately NOT the share sheet with a blank draft. That sheet exists
 * to describe an activity: it always attaches a deep link and a card. Reusing
 * it for a plain thought produced a post carrying a synthetic "On Ark" card
 * pointing at whatever page the author happened to be on — a claim they never
 * made. A composer with nothing to attach should attach nothing.
 */
export function SquareComposer({
  open,
  onClose,
  markets = [],
}: {
  open: boolean;
  onClose: () => void;
  /** Tradeable symbols, so the $ tool offers what this app can actually open. */
  markets?: TradableSymbol[];
}) {
  return (
    <ModalShell open={open} onClose={onClose}>
      {/* Keyed on `open`, so each opening MOUNTS a fresh body.
          
          This is the reset: a sheet that reopens still holding the last post's
          text — or its success message — reads as though nothing was sent. The
          obvious way to do that is to clear the fields in an effect when
          `open` flips, but setting state inside an effect body cascades an
          extra render every time, and React's own guidance is to let identity
          do the work instead. Remounting starts the state clean by
          construction, with no effect at all. */}
      <ComposerBody key={open ? "open" : "closed"} onClose={onClose} markets={markets} />
    </ModalShell>
  );
}

function ComposerBody({ onClose, markets }: { onClose: () => void; markets: TradableSymbol[] }) {
  const t = useTranslations("square");
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postedId, setPostedId] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const topicQuery = useQuery({
    queryKey: ["market-square", "topics"],
    queryFn: fetchSquareTopics,
    staleTime: 30 * 60_000,
  });

  // Focus after the modal's entry transition, so the caret is not stolen
  // mid-animation. Mount-only, and it touches the DOM rather than state —
  // which is what an effect is actually for.
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, []);

  const left = remaining(text);
  const ready = canPost(text) && !posting;

  async function submit() {
    if (!ready) return;
    setPosting(true);
    setError(null);
    try {
      const post = await createSquarePost(text.trim(), topics);
      setPostedId(post.id);
      setText("");
      setTopics([]);
      // The dashboard feed is the surface directly behind this sheet, so the
      // new post should be there when it closes rather than after a reload.
      await queryClient.invalidateQueries({ queryKey: ["market-square", "feed"] });
    } catch {
      // Never claim a post landed. The composer keeps the text so a failure
      // costs the author nothing but a second tap.
      setError(t("postFailed"));
    } finally {
      setPosting(false);
    }
  }

  const postedHref = postedId ? squareLinks.post(postedId) : null;

  return (
    <div className="p-5">
      <h2 className="font-sans text-[17px] font-semibold text-white">{t("composeTitle")}</h2>
      <p className="text-grey-500 mt-1 text-[13px]">{t("composeBlurb")}</p>

      <textarea
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // The convention people already have from every other composer.
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={t("composePlaceholder")}
        aria-label={t("composeTitle")}
        disabled={posting}
        className="border-grey-800 mt-4 h-32 w-full resize-none rounded-xl border bg-black/40 p-3 font-sans text-[14px] text-white outline-none placeholder:text-white/35 focus:border-white/30 disabled:opacity-60"
      />

      <div className="mt-3">
        <ComposerTools
          markets={markets}
          topics={topicQuery.data ?? []}
          selectedTopics={topics}
          disabled={posting}
          onInsertText={(fragment) => {
            const input = inputRef.current;
            const at = input?.selectionStart ?? text.length;
            setText(`${text.slice(0, at)}${fragment}${text.slice(at)}`);
            const caret = at + fragment.length;
            // Keep typing from where the insert ended, not from the end.
            window.requestAnimationFrame(() => {
              input?.focus();
              input?.setSelectionRange(caret, caret);
            });
          }}
          onToggleTopic={(key) =>
            setTopics((current) =>
              current.includes(key)
                ? current.filter((entry) => entry !== key)
                : // The service caps topics at 20; stop at the cap rather
                  // than letting the post be rejected after it is written.
                  current.length >= 20
                  ? current
                  : [...current, key]
            )
          }
          onInsertSymbol={(symbol) => {
            const input = inputRef.current;
            const next = insertSymbol(text, symbol, input?.selectionStart ?? text.length);
            setText(next.text);
            // Put the caret after what was just inserted, so typing carries
            // on from there rather than jumping to the end of the post.
            window.requestAnimationFrame(() => {
              input?.focus();
              input?.setSelectionRange(next.caret, next.caret);
            });
          }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {/* The counter appears only as the limit comes into view; a running
              tally from character one is pressure nobody asked for. */}
        <span
          className={"text-[12px] tabular-nums " + (left < 0 ? "text-down" : "text-grey-500")}
          aria-live="polite"
        >
          {text.trim().length >= COUNTER_VISIBLE_FROM ? left : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-grey-400 hover:text-grey-200 rounded-full px-3 py-2 text-[13px] font-medium transition-colors"
          >
            {t("composeCancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!ready}
            className="bg-accent text-ink inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold transition-[filter] hover:brightness-110 disabled:opacity-40"
          >
            {posting ? t("composePosting") : t("composeSubmit")}
          </button>
        </div>
      </div>

      {error ? <p className="text-down mt-3 text-[13px]">{error}</p> : null}

      {postedId ? (
        <p className="text-grey-300 mt-3 text-[13px]">
          {t("posted")}{" "}
          {postedHref ? (
            <a
              href={postedHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline"
            >
              {t("viewPost")}
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
