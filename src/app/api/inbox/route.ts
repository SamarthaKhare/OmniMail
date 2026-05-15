import { NextResponse } from "next/server";
import { syncAccounts, syncAllInboxes } from "@/agents/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [accounts, messages] = await Promise.all([syncAccounts(), syncAllInboxes()]);
    return NextResponse.json({ accounts, messages });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
