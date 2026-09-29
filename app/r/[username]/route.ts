import { NextResponse, type NextRequest } from "next/server";
import { isReferralCode } from "@/lib/referral-code";

// A referral landing link: /r/<code>. It stores the code in a cookie the
// client can read after sign-up, then sends the visitor to sign-in. The auth
// page forwards anyone already signed in straight to the dashboard, so the
// link is safe to open in any state. The claim itself happens later, client
// side, once a session exists; an invalid code simply sets no cookie.
//
// The code is a username OR the opaque one kash gives every wallet (ADR-0015).
// This route accepted usernames alone, so every link built from a given code
// set no cookie at all and attributed nobody, silently.

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const code = username.toLowerCase();
  // The link's query rides along: its utm_* tags are how Mixpanel attributes
  // the visit, and it reads them off the page the visitor lands on.
  const auth = new URL("/auth", req.url);
  auth.search = req.nextUrl.search;
  const res = NextResponse.redirect(auth);
  if (isReferralCode(code)) {
    // Readable by client script on purpose: the claim hook needs the value.
    res.cookies.set("ark_ref", code, {
      maxAge: THIRTY_DAYS_SECONDS,
      path: "/",
      sameSite: "lax",
    });
  }
  return res;
}
