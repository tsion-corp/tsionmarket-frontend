import { NextResponse, type NextRequest } from "next/server";

// A referral landing link: /r/<username>. It stores the code in a cookie the
// client can read after sign-up, then sends the visitor to sign-in. The auth
// page forwards anyone already signed in straight to the dashboard, so the
// link is safe to open in any state. The claim itself happens later, client
// side, once a session exists; an invalid code simply sets no cookie.
const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const code = username.toLowerCase();
  const res = NextResponse.redirect(new URL("/auth", req.url));
  if (USERNAME_PATTERN.test(code)) {
    // Readable by client script on purpose: the claim hook needs the value.
    res.cookies.set("ark_ref", code, {
      maxAge: THIRTY_DAYS_SECONDS,
      path: "/",
      sameSite: "lax",
    });
  }
  return res;
}
