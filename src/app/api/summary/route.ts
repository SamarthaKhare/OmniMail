import { NextResponse } from "next/server";
import { syncThread } from "@/agents/sync";
import { summarizeThread } from "@/agents/scribe";

export async function POST(req: Request) {
  try {
    const { threadId } = (await req.json()) as { threadId: string };
    if (!threadId) throw new Error("threadId required");
    const thread = await syncThread(threadId);
    const summary = await summarizeThread(thread);
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
