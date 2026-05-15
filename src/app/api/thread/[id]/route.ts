import { NextResponse } from "next/server";
import { syncThread } from "@/agents/sync";
import { getProviderForAccount } from "@/providers/registry";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const thread = await syncThread(params.id);
    // Mark messages in the thread as read on fetch (auto-read on open).
    await Promise.all(
      thread.messages
        .filter((m) => !m.isRead)
        .map((m) =>
          getProviderForAccount(m.accountId).applyAction({
            type: "mark_read",
            uid: m.uid,
            value: true,
          }),
        ),
    );
    return NextResponse.json(thread);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
