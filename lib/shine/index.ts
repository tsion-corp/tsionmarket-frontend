"use client";

// Shine: a confirmed action is posted to the user's Market Square, with no
// confirmation step and no button.
//
// This file is the whole surface a feature touches. A feature says "this
// happened, here are the facts" and stops. It does not know whether Shine is
// on, whether the post was already made, whether the square answered, or that
// a queue exists. reportShine returns void, never throws and never rejects, so
// no Shine failure can reach the trade that triggered it.
//
// WHERE THE PREFERENCE IS CHECKED, AND WHY HERE
//
// The gate is read inside reportShine, not by the seven call sites. The
// preference resolves asynchronously, so `isEnabled` has three answers, not
// two: on, off, and not known yet. Seven call sites is seven chances to write
// `?? true` or `!== false` and turn "not known yet" into a public post the
// user never agreed to. It is written once here, it is `=== true` or nothing,
// and one test covers every service.
//
// An unresolved preference is treated as OFF. The post that is not made can be
// made by hand; the post made against an unread preference cannot be taken
// back.

import { composeShinePost, type ShineTranslate } from "@/lib/shine/compose";
import { claimShinePost, hasShinePosted } from "@/lib/shine/posted-store";
import { ShinePostQueue, type ShineFailure } from "@/lib/shine/queue";
import type { ShineEvent, ShineService } from "@/lib/shine/types";

export interface ShineRuntime {
  /**
   * The signed-in account's Privy DID, or null while it is unknown.
   *
   * It keys the dedup record. Without it there is nothing to stop the next
   * person on this device inheriting this one's already-posted set, so a null
   * DID posts nothing.
   */
  accountDid: string | null;
  /**
   * Whether Shine is on for a service: true, false, or null while the
   * account-stored preference has not resolved. Null is never treated as on.
   */
  isEnabled: (service: ShineService) => boolean | null;
  /**
   * The author's catalogue, for the sentence itself.
   *
   * A Shine post is written in the language the person is using the app in,
   * so the copy lives in `shine.post` in all five catalogues and the composer
   * is handed a translator rather than reaching for one. It is required, not
   * optional with an English fallback: a fallback would mean a second copy of
   * thirteen sentences inside `lib/`, and the one thing worse than a post in
   * the wrong language is two places to change when the wording moves.
   */
  translate: ShineTranslate;
  /**
   * How a post is published. Defaults to the square's plain-text composer.
   *
   * createSquarePost, NOT createPost: a Shine post carries no deep link and no
   * card (ADR-2026-09-24 section 5, amended on approval), and createPost's own
   * comment explains that its link and its preview are inseparable.
   */
  post?: (text: string) => Promise<unknown>;
  /** Told about every post that will not be made. Optional. */
  onFailure?: (failure: ShineFailure) => void;
}

const MAX_TRACED_FAILURES = 20;

let runtime: ShineRuntime | null = null;
let queue: ShinePostQueue | null = null;
let queueDid: string | null = null;
let warnedUnconfigured = false;
const traced: ShineFailure[] = [];

function trace(failure: ShineFailure): void {
  traced.push(failure);
  if (traced.length > MAX_TRACED_FAILURES) {
    traced.splice(0, traced.length - MAX_TRACED_FAILURES);
  }
  runtime?.onFailure?.(failure);
}

function note(event: ShineEvent, code: string, message: string, loud = true): void {
  trace({
    service: event.service,
    id: event.id,
    attempts: 0,
    status: null,
    code,
    message,
    at: Date.now(),
  });
  if (loud) console.error(`[shine] ${event.service} ${event.id} was not posted: ${message}`);
}

/**
 * Install the runtime. Called once by the provider that knows the account and
 * the preference; passing null tears it down.
 *
 * Reconfiguring for a DIFFERENT account drops anything still queued. That is
 * deliberate: a post composed for the account that just signed out must not go
 * out under the one that just signed in. Reconfiguring for the same account
 * keeps the queue, so a provider that re-runs on an unrelated change does not
 * starve it.
 */
export function configureShine(next: ShineRuntime | null): void {
  runtime = next;
  const did = next?.accountDid ?? null;
  if (did !== queueDid) {
    queue = null;
    queueDid = did;
  }
}

/**
 * The square's client is loaded on the first post, not with the module.
 *
 * Importing it here put the whole Market Square client — posts, the feed,
 * uploads — into the initial payload of every service route that calls
 * reportShine, which is all seven. Most sessions never post anything, and a
 * session with Shine switched off never reaches this at all, because the gate
 * in reportShine returns before the queue is ever asked for.
 *
 * Nothing waits on it that a reader can see: the post is already fire and
 * forget, already queued behind a minimum gap, and the import resolves from
 * the same bundle the rest of the app is served from.
 */
async function postToSquare(text: string): Promise<unknown> {
  const injected = runtime?.post;
  if (injected) return injected(text);
  const { createSquarePost } = await import("@/lib/api/market-square");
  return createSquarePost(text);
}

function shineQueue(): ShinePostQueue {
  queue ??= new ShinePostQueue({
    store: { has: hasShinePosted, claim: claimShinePost },
    post: postToSquare,
    onFailure: trace,
  });
  return queue;
}

/**
 * Report a CONFIRMED action. Fire and forget.
 *
 * Never call this on a submission, an optimistic update or a pending state. A
 * post claiming a trade that later fails cannot be retracted.
 */
export function reportShine(event: ShineEvent): void {
  try {
    const current = runtime;
    if (current === null) {
      note(event, "SHINE_NOT_CONFIGURED", "no Shine runtime is installed", false);
      if (!warnedUnconfigured) {
        warnedUnconfigured = true;
        console.warn("[shine] an event was reported before the Shine runtime was installed.");
      }
      return;
    }

    const did = current.accountDid;
    if (did === null || did === "") {
      note(event, "SHINE_NO_ACCOUNT", "no signed-in account to post as", false);
      return;
    }

    // Strictly true. An unresolved preference is not consent.
    if (current.isEnabled(event.service) !== true) return;

    const composed = composeShinePost(event, current.translate);
    if (!composed.ok) {
      note(event, "SHINE_UNCOMPOSABLE", composed.reason);
      return;
    }

    shineQueue().enqueue({ did, service: event.service, id: event.id, text: composed.text });
  } catch (error) {
    // A trade is never broken by its own share. The failure is recorded and
    // logged rather than swallowed, and it stops here.
    note(event, "SHINE_REPORT_FAILED", error instanceof Error ? error.message : String(error));
  }
}

/** Every post that will not be made this session, newest last. */
export function shineFailures(): readonly ShineFailure[] {
  return traced;
}

/** Resolves when nothing is queued. For tests and for a diagnostics surface. */
export function whenShineIdle(): Promise<void> {
  return queue?.whenIdle() ?? Promise.resolve();
}

/** How many posts are waiting, including the one being sent. */
export function shineQueueDepth(): number {
  return queue?.depth ?? 0;
}

export { composeShinePost, type ShineTranslate } from "@/lib/shine/compose";
export {
  entryPriceFromBaseUnits,
  entryPriceFromUsdString,
  oddsFromDecimalString,
  pnlPercentFromBaseUnits,
  pnlPercentFromPoints,
  type EntryPrice,
  type Odds,
  type PnlPercent,
} from "@/lib/shine/money";
export { hasShinePosted } from "@/lib/shine/posted-store";
export type { ShineFailure } from "@/lib/shine/queue";
export { SHINE_SERVICES, type ShineEvent, type ShineService } from "@/lib/shine/types";
