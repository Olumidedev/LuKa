"use client";

import { useCallback, useEffect, useState } from "react";
import { call } from "@/lib/ai/client";
import { getSupabase } from "@/lib/cloud/supabase";
import { Button, Tag, useToast } from "../ui";

interface Run {
  id: string;
  source_id: string;
  job: string;
  status: string;
  started_at: string;
  records_seen: number;
  records_upserted: number;
  error: string | null;
}
interface Link {
  ingredient_id: string;
  source_id: string;
  external_id: string;
  matched_name: string | null;
  confidence: number | null;
  ingredients: { canonical_name: string } | null;
}

const JOBS = [
  { url: "/api/cron/sync-data?job=prices", label: "Sync StatCan prices" },
  { url: "/api/cron/sync-data?job=cnf", label: "Sync Canadian Nutrient File" },
  { url: "/api/cron/sync-data?job=fdc", label: "Sync USDA FoodData Central" },
  { url: "/api/cron/weekly-gap", label: "Run cuisine gap agent" },
];

/** Admin → Data: open-data syncs, their history, and automatic matches waiting for a human. */
export function DataSection() {
  const toast = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabase()!;
    const [{ data: r }, { data: l }] = await Promise.all([
      sb.from("ingestion_runs").select("id, source_id, job, status, started_at, records_seen, records_upserted, error").order("started_at", { ascending: false }).limit(25),
      sb.from("ingredient_source_links").select("ingredient_id, source_id, external_id, matched_name, confidence, ingredients(canonical_name)").eq("status", "auto").order("confidence", { ascending: true }).limit(40),
    ]);
    setRuns((r ?? []) as Run[]);
    setLinks((l ?? []) as unknown as Link[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (url: string, label: string) => {
    setBusy(url);
    try {
      await call(url, { method: "POST" });
      toast({ text: `${label}: done.` });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "That job failed." });
    } finally {
      setBusy(null);
      load();
    }
  };

  const decide = async (l: Link, status: "confirmed" | "rejected") => {
    const sb = getSupabase()!;
    const { error } = await sb.from("ingredient_source_links").update({ status, updated_at: new Date().toISOString() }).eq("ingredient_id", l.ingredient_id).eq("source_id", l.source_id);
    if (error) return toast({ text: error.message });
    if (status === "rejected") await sb.from("ingredient_nutrition").delete().eq("ingredient_id", l.ingredient_id).eq("source_id", l.source_id);
    else await sb.from("ingredient_nutrition").update({ verified_at: new Date().toISOString() }).eq("ingredient_id", l.ingredient_id).eq("source_id", l.source_id);
    load();
  };

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Data sources</h1>
        <p className="text-sm text-muted">Prices and nutrition come from public datasets on a schedule. Run a job now, or check the automatic matches below.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {JOBS.map((j) => (
          <Button key={j.url} size="sm" onClick={() => run(j.url, j.label)} disabled={!!busy}>
            {busy === j.url ? "Running…" : j.label}
          </Button>
        ))}
      </div>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Matches to check ({links.length})</h2>
        <p className="text-[13px] text-muted">Lowest confidence first. Rejecting removes the nutrition it brought in.</p>
        <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
          {links.map((l) => (
            <li key={`${l.ingredient_id}-${l.source_id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">{l.ingredients?.canonical_name}</p>
                <p className="text-muted">
                  → {l.matched_name} <span className="text-[12px]">({l.source_id} #{l.external_id}, {Math.round(Number(l.confidence ?? 0) * 100)}%)</span>
                </p>
              </div>
              <Button size="sm" variant="leaf" onClick={() => decide(l, "confirmed")}>
                Correct
              </Button>
              <Button size="sm" variant="danger" onClick={() => decide(l, "rejected")}>
                Wrong
              </Button>
            </li>
          ))}
          {!links.length && <li className="px-4 py-3 text-sm text-muted">No automatic matches waiting.</li>}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Recent runs</h2>
        <ul className="divide-y divide-line rounded-3xl border border-line bg-surface text-sm">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <strong>{r.source_id}</strong> · {r.job} · {new Date(r.started_at).toLocaleString()}
                {r.error && <span className="block text-danger">{r.error}</span>}
              </span>
              <span className="tnum text-muted">
                {r.records_upserted}/{r.records_seen}
              </span>
              <Tag tone={r.status === "succeeded" ? "leaf" : r.status === "running" ? "saffron" : "danger"}>{r.status}</Tag>
            </li>
          ))}
          {!runs.length && <li className="px-4 py-3 text-muted">No runs yet.</li>}
        </ul>
      </section>
    </div>
  );
}
