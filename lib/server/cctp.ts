import "server-only";
import { z } from "zod";
import { CCTP_IRIS_BASE } from "@/lib/cctp/config";
import { parseFeeQuote } from "@/lib/cctp/fees";

// Circle's attestation service (Iris), reached only from the /api/cctp route
// handler. It needs no key; it sits behind the app so the browser never talks
// to an upstream directly, and so both answers are validated in one place.

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const MESSAGES = /^v2\/messages\/(\d{1,3})$/;
const FEES = /^v2\/burn\/USDC\/fees\/(\d{1,3})\/(\d{1,3})$/;

export type IrisRoute =
  | { kind: "messages"; upstreamPath: string }
  | { kind: "fees"; upstreamPath: string }
  | { kind: "badRequest" }
  | { kind: "notFound" };

/**
 * Maps a browser request onto the one Iris request it may make. The query is
 * rebuilt from the parameters each route takes, never copied through.
 */
export function irisRoute(path: string, query: URLSearchParams): IrisRoute {
  if (path.includes("..") || path.includes("%") || path.includes("\\")) {
    return { kind: "notFound" };
  }

  const messages = MESSAGES.exec(path);
  if (messages) {
    const txHash = query.get("transactionHash") ?? "";
    if (!TX_HASH.test(txHash)) return { kind: "badRequest" };
    return { kind: "messages", upstreamPath: `${path}?transactionHash=${txHash}` };
  }

  if (FEES.test(path)) {
    const flags = new URLSearchParams();
    if (query.get("forward") === "true") flags.set("forward", "true");
    if (query.get("hyperCoreDeposit") === "true") flags.set("hyperCoreDeposit", "true");
    const suffix = flags.toString();
    return { kind: "fees", upstreamPath: suffix ? `${path}?${suffix}` : path };
  }

  return { kind: "notFound" };
}

const messagesSchema = z.object({
  messages: z
    .array(
      z.object({
        status: z.string(),
        message: z.string(),
        attestation: z.string(),
      })
    )
    .optional(),
});

/** Circle's answer, validated for the route it came from. Null when it is not. */
export function validIrisBody(kind: "messages" | "fees", body: unknown): unknown | null {
  if (kind === "fees") return parseFeeQuote(body);
  const parsed = messagesSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

const IRIS_TIMEOUT_MS = 10_000;

export function irisRequest(upstreamPath: string): Promise<Response> {
  return fetch(`${CCTP_IRIS_BASE}/${upstreamPath}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(IRIS_TIMEOUT_MS),
  });
}
