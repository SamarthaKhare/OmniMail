import { NextResponse } from "next/server";
import { listAccountRecords } from "@/lib/accounts-store";
import { googleConfig, microsoftConfig } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** GET /api/accounts → list connected accounts + provider availability. */
export async function GET() {
  const accounts = listAccountRecords().map((r) => ({
    id: r.id,
    provider: r.provider,
    email: r.email,
    displayName: r.displayName,
    color: r.color,
    createdAt: r.createdAt,
  }));
  return NextResponse.json({
    accounts,
    available: {
      gmail: googleConfig() !== null,
      outlook: microsoftConfig() !== null,
      imap: true,
    },
  });
}
