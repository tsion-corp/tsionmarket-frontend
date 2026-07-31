import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";

// Streams a file to a signed storage URL on the browser's behalf.
//
// The signed PUT was meant to go straight from the device, which is why the
// earn service hands out a URL rather than taking the bytes itself. The storage
// bucket answers a CORS preflight with 403 and no headers, so a browser PUT is
// refused before it starts. Until the bucket allows PUT from our origin, the
// upload comes through here instead.
//
// This is a forwarding proxy for a request body, which is exactly the shape of
// an SSRF hole, so it is deliberately narrow: a verified session, one storage
// host, https only, and a size cap.

// Only the bucket host the earn service signs for. Anything else is refused
// rather than fetched, so this cannot be pointed at an internal address.
const ALLOWED_HOST_SUFFIX = ".s3.filebase.com";

const MAX_BYTES = 5 * 1024 * 1024;

function bad(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

// A signed URL we are willing to forward to. Returns null for anything that is
// not https on the expected storage host.
function allowedTarget(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!url.hostname.endsWith(ALLOWED_HOST_SUFFIX)) return null;
  return url;
}

export async function POST(req: NextRequest) {
  if (!(await verifyRequest(req))) {
    return bad("UNAUTHORIZED", "Sign in to upload.", 401);
  }

  const target = allowedTarget(req.nextUrl.searchParams.get("url"));
  if (!target) {
    return bad("BAD_REQUEST", "That upload target isn't allowed.", 400);
  }

  const body = await req.arrayBuffer();
  if (body.byteLength === 0) return bad("BAD_REQUEST", "There was no file to upload.", 400);
  if (body.byteLength > MAX_BYTES) {
    return bad("BAD_REQUEST", "That image is too large.", 413);
  }

  // The service tells us which headers it signed for; sending anything else
  // breaks the signature.
  const contentType = req.headers.get("x-upload-content-type");

  try {
    const res = await fetch(target, {
      method: "PUT",
      headers: contentType ? { "content-type": contentType } : undefined,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      // Storage answers XML, which is no use to a screen. The status is what
      // matters: a 403 here means the signature expired or was rejected.
      console.error("Earn upload rejected:", res.status, await res.text().catch(() => ""));
      return bad("UPSTREAM_ERROR", "Storage refused that upload.", 502);
    }

    return NextResponse.json({ success: true, data: { uploaded: true } });
  } catch (error) {
    console.error("Earn upload failed:", error);
    return bad("UPSTREAM_ERROR", "The image couldn't be uploaded.", 502);
  }
}
