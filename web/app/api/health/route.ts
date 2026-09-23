import { NextResponse } from "next/server";

import { query, isPooled, requireUrl } from "@/lib/db";

// Never prerendered: a health check that was answered at build time is not a
// health check. This route must reach the database on every request.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const started = Date.now();
  try {
    const rows = await query<{ pitches: string }>("SELECT count(*) AS pitches FROM pitches");
    return NextResponse.json({
      ok: true,
      pitches: Number(rows[0].pitches),
      pooled: isPooled(requireUrl(process.env)),
      ms: Date.now() - started,
    });
  } catch (err) {
    // The message can carry the connection string on some driver errors, so
    // only the error's name crosses this boundary.
    console.error("health check failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.name : "Error", ms: Date.now() - started },
      { status: 503 },
    );
  }
}
