import { NextResponse } from "next/server";
import { z } from "zod";
import { syncAccounts, syncThread } from "@/agents/sync";
import { generateSmartReply } from "@/agents/scribe";

const Body = z.object({
  threadId: z.string(),
  voice: z.enum(["professional", "casual", "short"]).default("professional"),
  fromAccountId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const { threadId, voice, fromAccountId } = Body.parse(await req.json());
    const [accounts, thread] = await Promise.all([syncAccounts(), syncThread(threadId)]);
    const account = accounts.find((a) => a.id === (fromAccountId ?? thread.accountId));
    if (!account) throw new Error(`No matching account for thread ${threadId}`);
    const draft = await generateSmartReply({ thread, account, voice });
    return NextResponse.json(draft);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
