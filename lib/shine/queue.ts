// The one path from a confirmed event to a published post.
//
// createPost and createSquarePost have no rate limit, no retry, no queue and
// no dedup, client or proxy. The square's only 429 handling in this app is a
// sentence written for a person who has just pressed a button: "You are
// posting too quickly. Wait a moment and try again." With Shine there is no
// button and nobody reading, so a run of memecoin trades in a minute would
// hand the gateway a burst and lose whatever it refused, silently.
//
// So: one post in flight at a time, a gap between posts, a bounded retry on
// failures that can pass, and no retry at all on a refusal that never will.
//
// FAILURES ARE SILENT TO THE USER, by the maintainer's decision. Silent is not
// the same as lost without trace: every permanent failure is logged with the
// service, the id and the square's own diagnosis, and kept in a bounded
// in-memory list this module exposes. A support conversation that starts "my
// trade did not post" has something to read.
//
// THE QUEUE DOES NOT SURVIVE A RELOAD, on purpose. A claim is written before a
// post is sent and is never released, so a job lost to a reload could not be
// re-posted anyway. Persisting the queue would mean holding the claim back
// until a send succeeded, and that reopens the exact case this module exists
// to close: a post that reached the square but whose acknowledgement we never
// saw would be sent a second time from the restored queue. A post that is
// queued and lost to a reload is a post nobody sees. A post sent twice is
// permanent and public. The queue is in memory, and it survives navigation
// within the app because nothing about it is tied to a React tree.

import { errorCode, errorStatus } from "@/lib/api/envelope";
import { retryDelay } from "@/lib/retry-delay";
import { shareErrorMessage } from "@/lib/square/share-error";
import type { ShineClaimOutcome } from "@/lib/shine/posted-store";
import type { ShineService } from "@/lib/shine/types";

/** What the queue needs from the dedup store, so it can be tested without one. */
export interface ShineDedupStore {
  has(did: string, service: ShineService, id: string): boolean;
  claim(did: string, service: ShineService, id: string): ShineClaimOutcome;
}

export interface ShineJob {
  did: string;
  service: ShineService;
  id: string;
  text: string;
}

export interface ShineFailure {
  service: ShineService;
  id: string;
  /** How many times the post was actually sent. Zero when it never was. */
  attempts: number;
  status: number | null;
  code: string | null;
  /** The square's own diagnosis, from lib/square/share-error. */
  message: string;
  at: number;
}

export interface ShinePostQueueOptions {
  store: ShineDedupStore;
  post: (text: string) => Promise<unknown>;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
  random?: () => number;
  onFailure?: (failure: ShineFailure) => void;
  maxAttempts?: number;
  minGapMs?: number;
  maxFailures?: number;
}

/** Four sends over roughly fifteen seconds, then the post is given up on. */
const DEFAULT_MAX_ATTEMPTS = 4;

/**
 * The smallest gap between two posts.
 *
 * A confirmation dialog used to pace this: nobody taps share twice in a
 * second. Nothing paces it now, so this does. It is not a substitute for a
 * server-side limit, which is the square's to decide.
 */
const DEFAULT_MIN_GAP_MS = 1200;

/** A 429 means the gap was not enough, so back off past it rather than nibble. */
const RATE_LIMIT_FLOOR_MS = 5000;

const DEFAULT_MAX_FAILURES = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether sending the same text again could ever produce a different answer.
 *
 * A refusal the square has already made (a bad body, a session it does not
 * accept, a route that is not deployed) will be made again, and retrying it
 * three more times is three more requests for the same nothing. A timeout, a
 * rate limit, a 5xx or a dropped connection are all "not now", and those are
 * the ones worth waiting on.
 *
 * A throw with no status did not come from the gateway: it is a network drop
 * or a bug of ours. Treated as transient, because the network drop is by far
 * the commoner of the two and a bug is caught at compose time, before a job
 * is ever queued.
 */
export function isRetryableShineFailure(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === null) return errorCode(error) === null;
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500;
}

export class ShinePostQueue {
  private readonly options: Required<Omit<ShinePostQueueOptions, "onFailure">> &
    Pick<ShinePostQueueOptions, "onFailure">;
  private readonly pending: ShineJob[] = [];
  private readonly failed: ShineFailure[] = [];
  private readonly idleWaiters: Array<() => void> = [];
  private running = false;
  private lastSentAt: number | null = null;

  constructor(options: ShinePostQueueOptions) {
    this.options = {
      now: () => Date.now(),
      delay: sleep,
      random: Math.random,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      minGapMs: DEFAULT_MIN_GAP_MS,
      maxFailures: DEFAULT_MAX_FAILURES,
      ...options,
    };
  }

  /**
   * Add a post, unless this event is already queued or already published.
   *
   * The check here is a cheap rejection: a poll that re-serves a settled row
   * every sixty seconds would otherwise build a queue of hundreds of copies of
   * one post, all of which the claim would then discard one at a time. The
   * claim in `send` remains the authority.
   */
  enqueue(job: ShineJob): void {
    const queued = this.pending.some(
      (other) => other.did === job.did && other.service === job.service && other.id === job.id
    );
    if (queued) return;
    if (this.options.store.has(job.did, job.service, job.id)) return;
    this.pending.push(job);
    if (!this.running) {
      this.running = true;
      void this.pump();
    }
  }

  /** Resolves when the queue has drained. */
  whenIdle(): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** The permanent failures this session, newest last. */
  failures(): readonly ShineFailure[] {
    return this.failed;
  }

  /** How many posts are waiting, including the one being sent. */
  get depth(): number {
    return this.pending.length + (this.running ? 1 : 0);
  }

  private async pump(): Promise<void> {
    try {
      for (let job = this.pending.shift(); job !== undefined; job = this.pending.shift()) {
        await this.send(job);
      }
    } finally {
      this.running = false;
      const waiters = this.idleWaiters.splice(0);
      for (const resolve of waiters) resolve();
    }
  }

  private async send(job: ShineJob): Promise<void> {
    const claim = this.options.store.claim(job.did, job.service, job.id);
    if (claim === "already-posted") return;
    if (claim === "storage-unavailable") {
      // Nothing is sent that this browser cannot remember sending. See
      // lib/shine/posted-store.ts for why that direction and not the other.
      this.record(
        job,
        0,
        null,
        "SHINE_STORAGE_UNAVAILABLE",
        "Shine could not record the post before sending it, so it was not sent."
      );
      return;
    }

    await this.spaceOutFromLastPost();

    for (let attempt = 0; attempt < this.options.maxAttempts; attempt += 1) {
      try {
        await this.options.post(job.text);
        this.lastSentAt = this.options.now();
        return;
      } catch (error) {
        this.lastSentAt = this.options.now();
        const lastAttempt = attempt + 1 >= this.options.maxAttempts;
        if (lastAttempt || !isRetryableShineFailure(error)) {
          this.record(
            job,
            attempt + 1,
            errorStatus(error),
            errorCode(error),
            shareErrorMessage(error)
          );
          return;
        }
        await this.options.delay(this.backoffFor(attempt, error));
      }
    }
  }

  private backoffFor(attempt: number, error: unknown): number {
    const base = retryDelay(attempt, this.options.random);
    return errorStatus(error) === 429 ? Math.max(base, RATE_LIMIT_FLOOR_MS) : base;
  }

  private async spaceOutFromLastPost(): Promise<void> {
    if (this.lastSentAt === null) return;
    const elapsed = this.options.now() - this.lastSentAt;
    if (elapsed < this.options.minGapMs) await this.options.delay(this.options.minGapMs - elapsed);
  }

  /**
   * Keep and log a post that will not be made.
   *
   * The claim is deliberately NOT released. We cannot tell a request the square
   * refused from one it accepted and failed to acknowledge, and releasing the
   * claim would let a poll re-fire into a second copy of a post that may
   * already be public. A post nobody sees is the cheaper mistake.
   */
  private record(
    job: ShineJob,
    attempts: number,
    status: number | null,
    code: string | null,
    message: string
  ): void {
    const failure: ShineFailure = {
      service: job.service,
      id: job.id,
      attempts,
      status,
      code,
      message,
      at: this.options.now(),
    };
    this.failed.push(failure);
    if (this.failed.length > this.options.maxFailures) {
      this.failed.splice(0, this.failed.length - this.options.maxFailures);
    }
    console.error(
      `[shine] ${job.service} ${job.id} was not posted after ${attempts} attempt(s): ${message}`,
      { status, code }
    );
    this.options.onFailure?.(failure);
  }
}
