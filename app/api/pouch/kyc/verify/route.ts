import { NextResponse, type NextRequest } from "next/server";
import { PouchConfigError, pouchErrorMessage, pouchRequest } from "@/lib/server/pouch";

// Verify the emailed OTP. On success Pouch returns a JWT that authorizes KYC
// submission and every later onramp, so the client persists it for reuse.
export async function POST(req: NextRequest) {
  let body: { email?: unknown; otp?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const otp = typeof body.otp === "string" ? body.otp.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!/^[0-9]{6}$/.test(otp)) {
    return NextResponse.json({ error: "Enter the six-digit code" }, { status: 400 });
  }

  try {
    const { status, data } = await pouchRequest("/shared-kyc/verify", {
      method: "POST",
      body: { email, otp },
    });
    if (status >= 400) {
      return NextResponse.json(
        { error: pouchErrorMessage(data, "That code did not match") },
        { status }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof PouchConfigError) {
      console.error("Pouch KYC verify: not configured");
      return NextResponse.json({ error: "Verification is unavailable right now" }, { status: 500 });
    }
    console.error("Pouch KYC verify failed:", error);
    return NextResponse.json({ error: "Could not verify the code" }, { status: 502 });
  }
}
