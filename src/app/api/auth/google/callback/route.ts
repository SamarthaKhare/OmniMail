import { NextResponse } from "next/server";
import { exchangeCode, googleConfig } from "@/lib/oauth";
import { upsertAccount } from "@/lib/accounts-store";

export async function GET(req: Request) {
  const cfg = googleConfig();
  if (!cfg) {
    return NextResponse.redirect(new URL("/accounts?error=gmail_not_configured", req.url));
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers.get("cookie")?.match(/oauth_state_google=([^;]+)/)?.[1];
  if (!code) return NextResponse.redirect(new URL("/accounts?error=missing_code", req.url));
  if (!state || state !== cookieState) {
    return NextResponse.redirect(new URL("/accounts?error=bad_state", req.url));
  }

  try {
    const tokens = await exchangeCode(cfg, code);
    if (!tokens.refreshToken) {
      throw new Error("Google did not return a refresh token. Try revoking access in your Google account and retrying.");
    }
    // Fetch the user's email + name with the access token
    const u = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!u.ok) throw new Error(`userinfo failed: ${u.status}`);
    const info = (await u.json()) as { email: string; name?: string; picture?: string };

    upsertAccount({
      provider: "gmail",
      email: info.email,
      displayName: info.name ?? info.email.split("@")[0],
      credentials: {
        kind: "gmail",
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      },
    });
    return NextResponse.redirect(new URL("/accounts?connected=gmail", req.url));
  } catch (err) {
    const msg = encodeURIComponent((err as Error).message);
    return NextResponse.redirect(new URL(`/accounts?error=${msg}`, req.url));
  }
}
