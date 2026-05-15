import { NextResponse } from "next/server";
import { runOrchestrator } from "@/agents/orchestrator";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  try {
    const result = await runOrchestrator(q);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
