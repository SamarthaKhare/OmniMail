import { NextResponse } from "next/server";
import { buildAuthorizeUrl, makeState, microsoftConfig } from "@/lib/oauth";

// OAuth authorize must NEVER be cached — see google/authorize for full context.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const cfg = microsoftConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Outlook OAuth is not configured. Set MS_CLIENT_ID and MS_CLIENT_SECRET." },
      { status: 400 },
    );
  }
  const state = makeState();
  const url = buildAuthorizeUrl(cfg, state);
  const res = NextResponse.redirect(url, { status: 302 });
  res.cookies.set("oauth_state_microsoft", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
