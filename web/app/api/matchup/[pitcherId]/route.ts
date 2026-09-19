import { NextResponse } from "next/server";

import { getMatchup } from "@/lib/matchup-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pitcherId: string }> },
) {
  try {
    const result = await getMatchup(Number((await params).pitcherId));
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("matchup failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.name : "Error" },
      { status: 503 },
    );
  }
}
