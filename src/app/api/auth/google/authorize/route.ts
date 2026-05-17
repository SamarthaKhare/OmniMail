import { NextResponse } from "next/server";
import { buildAuthorizeUrl, googleConfig, makeState } from "@/lib/oauth";

// Critical: OAuth authorize MUST be uncached. Vercel was caching this on the
// edge, returning the same state + cookie to every user, which caused Google
// to reject the token exchange with `redirect_uri_mismatch` because the same
// authorization code was being replayed.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const cfg = googleConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 400 },
    );
  }
  const state = makeState();
  const url = buildAuthorizeUrl(cfg, state);
  const res = NextResponse.redirect(url, { status: 302 });
  res.cookies.set("oauth_state_google", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
