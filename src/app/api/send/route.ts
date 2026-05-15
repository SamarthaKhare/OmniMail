import { NextResponse } from "next/server";
import { z } from "zod";
import { getProviderForAccount } from "@/providers/registry";

const Body = z.object({
  fromAccountId: z.string(),
  to: z.array(z.object({ name: z.string().optional(), email: z.string().email() })).min(1),
  cc: z.array(z.object({ name: z.string().optional(), email: z.string().email() })).optional(),
  bcc: z.array(z.object({ name: z.string().optional(), email: z.string().email() })).optional(),
  subject: z.string(),
  body: z.string(),
  inReplyToUid: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const draft = Body.parse(await req.json());
    const provider = getProviderForAccount(draft.fromAccountId);
    const sent = await provider.sendMessage(draft);
    return NextResponse.json(sent);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
