import { NextResponse, type NextRequest } from "next/server";
import {
  bearerFromRequest,
  PouchConfigError,
  pouchErrorMessage,
  pouchRequest,
} from "@/lib/server/pouch";

// Submit the collected KYC fields. Requires the user's Shared KYC JWT.
// `documents` is Pouch's flat map of document type to value, built on the client
// from the required fields.
export async function POST(req: NextRequest) {
  const token = bearerFromRequest(req);
  if (!token) return NextResponse.json({ error: "Not verified" }, { status: 401 });

  let body: { countryCode?: unknown; documents?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const countryCode = typeof body.countryCode === "string" ? body.countryCode.trim() : "";
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return NextResponse.json({ error: "A valid country is required" }, { status: 400 });
  }
  const documents = body.documents;
  const isStringMap =
    documents != null &&
    typeof documents === "object" &&
    !Array.isArray(documents) &&
    Object.values(documents as Record<string, unknown>).every((v) => typeof v === "string");
  if (!isStringMap || Object.keys(documents as Record<string, string>).length === 0) {
    return NextResponse.json({ error: "Provide the required information" }, { status: 400 });
  }

  try {
    const { status, data } = await pouchRequest("/shared-kyc/kyc/submit", {
      method: "POST",
      token,
      body: { countryCode, documents },
    });
    if (status >= 400) {
      return NextResponse.json(
        { error: pouchErrorMessage(data, "Could not submit your details") },
        { status }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof PouchConfigError) {
      console.error("Pouch KYC submit: not configured");
      return NextResponse.json({ error: "Verification is unavailable right now" }, { status: 500 });
    }
    console.error("Pouch KYC submit failed:", error);
    return NextResponse.json({ error: "Could not submit your details" }, { status: 502 });
  }
}
