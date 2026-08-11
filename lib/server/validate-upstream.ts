import type { z } from "zod";

// Validates without transforming, so a field no schema models still reaches
// the client. Only successful envelopes are judged.

export interface UpstreamCheck {
  ok: boolean;
  problem?: string;
}

export function checkUpstream(
  schema: z.ZodType | null,
  body: unknown,
  { service, path }: { service: string; path: string }
): UpstreamCheck {
  if (!schema) return { ok: true };

  const envelope = body as { success?: boolean; data?: unknown } | null;
  if (!envelope || envelope.success !== true) return { ok: true };

  const result = schema.safeParse(envelope.data);
  if (result.success) return { ok: true };

  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  return { ok: false, problem: `${service} ${path} no longer matches the contract: ${issues}` };
}
