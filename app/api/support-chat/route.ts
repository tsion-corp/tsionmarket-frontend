import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty"),
});

const UpstreamParsedSchema = z.object({
  reply: z.string().default(""),
  confidence: z.number().optional().default(1),
  needs_human: z.boolean().optional().default(false),
  reason: z.string().nullable().optional(),
});

const UpstreamResponseSchema = z.object({
  ok: z.boolean().optional().default(true),
  parsed: UpstreamParsedSchema.optional(),
  reply: z.string().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parseResult = RequestSchema.safeParse(body);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues[0]?.message || "Invalid message format";
      return NextResponse.json({ ok: false, error: errorMessage }, { status: 400 });
    }

    const { message } = parseResult.data;
    const baseUrl = (process.env.SUPPORT_CHAT_API_URL || "https://support.tsionark.com").replace(
      /\/$/,
      ""
    );

    const targetUrl = `${baseUrl}/api/demo-chat`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const upstreamRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!upstreamRes.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `Upstream support service returned ${upstreamRes.status}`,
          },
          { status: 502 }
        );
      }

      const rawJson = await upstreamRes.json();
      const parsedUpstream = UpstreamResponseSchema.safeParse(rawJson);

      if (!parsedUpstream.success) {
        return NextResponse.json(
          { ok: false, error: "Malformed upstream response format" },
          { status: 502 }
        );
      }

      let replyText = parsedUpstream.data.parsed?.reply || parsedUpstream.data.reply || "";
      const confidence = parsedUpstream.data.parsed?.confidence ?? 1;
      const needsHuman = parsedUpstream.data.parsed?.needs_human ?? false;

      if (!replyText.trim()) {
        if (needsHuman) {
          replyText =
            "I have noted your inquiry and am connecting you with a human support specialist to assist you directly.";
        } else {
          replyText =
            "Thank you for your message! How can I assist you with your account, trading, or deposits on World Street?";
        }
      }

      return NextResponse.json({
        ok: true,
        reply: replyText,
        confidence,
        needsHuman,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        {
          ok: false,
          error:
            fetchErr instanceof Error && fetchErr.name === "AbortError"
              ? "Upstream support request timed out"
              : "Failed to communicate with support service",
        },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
