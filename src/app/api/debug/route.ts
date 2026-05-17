import { NextResponse } from "next/server";

/** Temporary debug endpoint — remove after fixing OAuth. */
export async function GET() {
  const baseUrl = process.env.OMNIMAIL_BASE_URL ?? "(not set — using localhost fallback)";
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "(not set)";

  return NextResponse.json({
    OMNIMAIL_BASE_URL: baseUrl,
    GOOGLE_CLIENT_ID_prefix: clientId.slice(0, 20) + "...",
    redirect_uri_that_server_sends: `${process.env.OMNIMAIL_BASE_URL ?? "http://localhost:3100"}/api/auth/google/callback`,
  });
}
