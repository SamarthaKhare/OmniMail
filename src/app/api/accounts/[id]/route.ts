import { NextResponse } from "next/server";
import { removeAccount } from "@/lib/accounts-store";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ok = removeAccount(params.id);
  if (!ok) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
