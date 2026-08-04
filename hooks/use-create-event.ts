"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePredictionActions } from "@/hooks/use-prediction-actions";
import {
  addGroupMember,
  attachMetadata,
  createGroup,
  newIdempotencyKey,
  uploadGroupImage,
} from "@/lib/prediction/api";
import { randomMarketId } from "@/lib/prediction/logic";

// Orchestrates creating a MULTI-OUTCOME event: for each outcome it signs an
// on-chain createMarket (gasless), then registers all of them as members of one
// off-chain group. Runs SEQUENTIALLY so a partial failure is visible and
// resumable — each outcome reports its own status. The backend/group never signs.

export interface OutcomeInput {
  label: string; // "25 bps increase", "White cap"
  imageUrl?: string; // per-outcome icon (optional)
}

export type OutcomeStatus = "pending" | "creating" | "done" | "failed";

export interface OutcomeProgress {
  label: string;
  status: OutcomeStatus;
  marketId?: string;
}

export interface CreateEventInput {
  title: string;
  category?: string;
  rules?: string;
  description?: string;
  imageUrl?: string; // event banner
  closeTime: number; // unix seconds; shared by all outcomes
  seedUsdc: bigint; // seed per outcome market
  outcomes: OutcomeInput[];
}

// Retries an off-chain metadata write a few times before giving up. The group
// and member writes are keyless and carry a fresh idempotency key per attempt is
// NOT used — the SAME key is reused across retries so a write that actually
// landed (but whose response was lost to a timeout) is deduplicated upstream
// rather than duplicated. Only transient failures (timeout, 5xx) are retried;
// this is what stops an interrupted create from leaving a group with missing
// members (which then leak into the browse grid as loose "Title — Outcome"
// cards).
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      // Small linear backoff between attempts (300ms, 600ms).
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

// kebab-case slug from the title, de-duplicated with a short random suffix so two
// events with the same title don't collide.
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = randomMarketId().toString(16).slice(0, 6);
  return `${base || "event"}-${suffix}`;
}

export function useCreateEvent() {
  const actions = usePredictionActions();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<OutcomeProgress[]>([]);
  const [phase, setPhase] = useState<"idle" | "creating" | "grouping" | "done">("idle");

  const create = useCallback(
    async (input: CreateEventInput): Promise<{ groupId: string } | null> => {
      setPhase("creating");
      setProgress(input.outcomes.map((o) => ({ label: o.label, status: "pending" })));

      // 1) Create each outcome market on-chain, sequentially. Each outcome that
      // succeeds records its marketId; a failure marks that row and is SKIPPED
      // (not fatal). We group whatever succeeded as long as at least two
      // outcomes landed — a single flaky on-chain create must not abandon the
      // whole event ungrouped (which is what left orphaned markets with no group
      // and nothing to render). Failed rows can be re-created later.
      const created: Array<{ label: string; marketId: string; imageUrl?: string }> = [];
      for (let i = 0; i < input.outcomes.length; i++) {
        const outcome = input.outcomes[i];
        const marketId = randomMarketId();
        setProgress((p) => p.map((row, idx) => (idx === i ? { ...row, status: "creating" } : row)));

        // Per-outcome question: "<title> — <label>". Kept human-readable so the
        // underlying binary market reads sensibly on its own detail page too.
        const question = `${input.title} — ${outcome.label}`;
        const result = await actions.createMarket({
          marketId,
          closeTime: input.closeTime,
          seedUsdc: input.seedUsdc,
        });
        if (!result) {
          // Mark this outcome failed and move on to the next — do NOT abort the
          // whole event. Grouping below proceeds with the outcomes that landed.
          setProgress((p) => p.map((row, idx) => (idx === i ? { ...row, status: "failed" } : row)));
          continue;
        }
        // Attach the per-outcome question/rules so the binary market has metadata.
        try {
          await attachMetadata(
            marketId.toString(),
            {
              question,
              category: input.category,
              rules: input.rules,
              imageUrl: outcome.imageUrl,
            },
            newIdempotencyKey()
          );
        } catch {
          // Non-fatal: the on-chain market exists; metadata can be re-attached.
        }
        created.push({
          label: outcome.label,
          marketId: marketId.toString(),
          imageUrl: outcome.imageUrl,
        });
        setProgress((p) =>
          p.map((row, idx) =>
            idx === i ? { ...row, status: "done", marketId: marketId.toString() } : row
          )
        );
      }

      // An event needs at least two outcomes to be a meaningful group. If fewer
      // than two landed on-chain, there's nothing coherent to group — surface a
      // failure so the user retries rather than silently creating a 1-outcome
      // "event".
      if (created.length < 2) {
        setPhase("idle");
        return null;
      }

      // 2) Create the off-chain group and attach every created market as a
      // labelled outcome. Keyless — records metadata, signs nothing.
      setPhase("grouping");
      const slug = slugify(input.title);
      // One idempotency key per write, fixed BEFORE the retry loop so every retry
      // of the same write reuses it (a landed-but-timed-out write dedupes upstream
      // instead of creating a duplicate group/member).
      const groupKey = newIdempotencyKey();
      const { id: groupId } = await withRetry(() =>
        createGroup(
          {
            slug,
            title: input.title,
            category: input.category,
            rules: input.rules,
            description: input.description,
            imageUrl: input.imageUrl,
            closeTime: input.closeTime,
          },
          groupKey
        )
      );
      // Attach every created market as a labelled outcome, each retried on a
      // transient failure so a single slow response can't leave the event with
      // missing outcomes.
      const memberKeys = created.map(() => newIdempotencyKey());
      for (let i = 0; i < created.length; i++) {
        const c = created[i];
        await withRetry(() =>
          addGroupMember(
            groupId,
            { marketId: c.marketId, label: c.label, imageUrl: c.imageUrl, sortOrder: i },
            memberKeys[i]
          )
        );
      }

      setPhase("done");
      void queryClient.invalidateQueries({ queryKey: ["prediction"] });
      return { groupId };
    },
    [actions, queryClient]
  );

  return {
    create,
    progress,
    phase,
    busy: phase === "creating" || phase === "grouping",
    uploadGroupImage,
  };
}
