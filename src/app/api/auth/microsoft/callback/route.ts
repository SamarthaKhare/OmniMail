import { NextResponse } from "next/server";
import { exchangeCode, microsoftConfig } from "@/lib/oauth";
import { upsertAccount } from "@/lib/accounts-store";

export async function GET(req: Request) {
  const cfg = microsoftConfig();
  if (!cfg) {
    return NextResponse.redirect(new URL("/accounts?error=outlook_not_configured", req.url));
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers.get("cookie")?.match(/oauth_state_microsoft=([^;]+)/)?.[1];
  if (!code) return NextResponse.redirect(new URL("/accounts?error=missing_code", req.url));
  if (!state || state !== cookieState) {
    return NextResponse.redirect(new URL("/accounts?error=bad_state", req.url));
  }

  try {
    const tokens = await exchangeCode(cfg, code);
    if (!tokens.refreshToken) {
      throw new Error("Microsoft did not return a refresh token. Check that the 'offline_access' scope was granted.");
    }
    const u = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!u.ok) throw new Error(`Graph /me failed: ${u.status}`);
    const info = (await u.json()) as { mail?: string; userPrincipalName: string; displayName?: string };
    const email = info.mail ?? info.userPrincipalName;

    upsertAccount({
      provider: "outlook",
      email,
      displayName: info.displayName ?? email.split("@")[0],
      credentials: {
        kind: "outlook",
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      },
    });
    return NextResponse.redirect(new URL("/accounts?connected=outlook", req.url));
  } catch (err) {
    const msg = encodeURIComponent((err as Error).message);
    return NextResponse.redirect(new URL(`/accounts?error=${msg}`, req.url));
  }
}
