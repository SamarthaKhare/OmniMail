import { NextResponse } from "next/server";
import { syncAllInboxes } from "@/agents/sync";
import { generatePulse } from "@/agents/scribe";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const msgs = await syncAllInboxes();
    const pulse = await generatePulse(msgs);
    return NextResponse.json(pulse);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
