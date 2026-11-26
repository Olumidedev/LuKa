import type { SupabaseClient } from "@supabase/supabase-js";

/** Every connector run is logged to ingestion_runs so admins can see what changed and when. */
export interface RunStats {
  seen: number;
  upserted: number;
  details?: Record<string, unknown>;
}

export async function withRun<T extends RunStats>(db: SupabaseClient, sourceId: string, job: string, fn: () => Promise<T>): Promise<T & { runId: string | null }> {
  const { data } = await db.from("ingestion_runs").insert({ source_id: sourceId, job }).select("id").single();
  const runId = (data?.id as string) ?? null;
  try {
    const stats = await fn();
    const failed = Number((stats.details as { failed?: number } | undefined)?.failed ?? 0);
    await db
      .from("ingestion_runs")
      .update({ status: failed ? "partial" : "succeeded", finished_at: new Date().toISOString(), records_seen: stats.seen, records_upserted: stats.upserted, details: stats.details ?? {} })
      .eq("id", runId);
    await db.from("data_sources").update({ last_synced_at: new Date().toISOString() }).eq("id", sourceId);
    return { ...stats, runId };
  } catch (e) {
    await db.from("ingestion_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: e instanceof Error ? e.message.slice(0, 2000) : String(e) }).eq("id", runId);
    throw e;
  }
}
