import { NextResponse, type NextRequest } from "next/server";
import { PouchConfigError, pouchErrorMessage, pouchRequest } from "@/lib/server/pouch";

// Start Shared KYC: Pouch emails a six-digit OTP and tells us whether the user
// already has KYC and which fields are required. Authorized with the partner key
// server-side; the response drives the onboarding.
export async function POST(req: NextRequest) {
  let body: { email?: unknown; countryCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const countryCode = typeof body.countryCode === "string" ? body.countryCode.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return NextResponse.json({ error: "A valid country is required" }, { status: 400 });
  }

  try {
    const { status, data } = await pouchRequest("/shared-kyc/initiate", {
      method: "POST",
      body: { email, countryCode },
    });
    if (status >= 400) {
      return NextResponse.json(
        { error: pouchErrorMessage(data, "Could not start verification") },
        { status }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof PouchConfigError) {
      console.error("Pouch KYC initiate: not configured");
      return NextResponse.json({ error: "Verification is unavailable right now" }, { status: 500 });
    }
    console.error("Pouch KYC initiate failed:", error);
    return NextResponse.json({ error: "Could not start verification" }, { status: 502 });
  }
}
