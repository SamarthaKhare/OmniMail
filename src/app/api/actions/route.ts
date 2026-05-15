import { NextResponse } from "next/server";
import { z } from "zod";
import { getProviderForAccount } from "@/providers/registry";
import { parseUid } from "@/types/protocol";

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("archive"), uid: z.string() }),
  z.object({ type: z.literal("delete"), uid: z.string() }),
  z.object({ type: z.literal("star"), uid: z.string(), value: z.boolean() }),
  z.object({ type: z.literal("mark_read"), uid: z.string(), value: z.boolean() }),
  z.object({ type: z.literal("label"), uid: z.string(), label: z.string(), value: z.boolean() }),
]);

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const action = ActionSchema.parse(json);
    const { accountId } = parseUid(action.uid);
    await getProviderForAccount(accountId).applyAction(action);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
