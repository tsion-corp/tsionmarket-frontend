import { type NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server/auth";

// Text-to-speech proxy for Vivid. The frontend speaks the assistant's replies
// itself, so the AI backend stays lean (STT + intent only). This route keeps the
// ElevenLabs key server-side and STREAMS the audio straight through to the
// browser — chunks flow as ElevenLabs produces them, so speech starts almost
// immediately rather than waiting for the whole clip. British-English voice by
// default (see .env ELEVENLABS_TTS_VOICE_ID).

const ELEVENLABS_BASE = "https://api.elevenlabs.io";

const API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const VOICE_ID = process.env.ELEVENLABS_TTS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb"; // "George" (UK)
// Flash v2.5 is the low-latency model — first audio bytes come back fast, which
// is what makes streamed speech feel responsive.
const MODEL_ID = process.env.ELEVENLABS_TTS_MODEL ?? "eleven_flash_v2_5";

// Cap the text so a runaway response can't run up a huge synthesis bill.
const MAX_CHARS = 800;

export async function POST(req: NextRequest) {
  // Vivid is a signed-in feature; require a valid session.
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!API_KEY) {
    return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
  }

  let body: { text?: string; voiceId?: string };
  try {
    body = (await req.json()) as { text?: string; voiceId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text ?? "").trim().slice(0, MAX_CHARS);
  if (!text) {
    return NextResponse.json({ error: "No text" }, { status: 400 });
  }
  const voiceId = body.voiceId || VOICE_ID;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    // `/stream` returns the audio as a chunked body; we pipe it straight to the
    // client so playback can begin before synthesis finishes.
    const upstream = await fetch(
      `${ELEVENLABS_BASE}/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": API_KEY,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          // A hint that keeps British pronunciation stable on the flash model.
          language_code: "en",
          voice_settings: { stability: 0.5, similarity_boost: 0.8, speed: 1.0 },
        }),
        signal: controller.signal,
      }
    );

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: "TTS failed", detail: detail.slice(0, 200) },
        { status: upstream.status || 502 }
      );
    }

    // Stream the audio through. The client plays it as it arrives.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "timeout" : "error";
    return NextResponse.json({ error: `TTS ${reason}` }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
