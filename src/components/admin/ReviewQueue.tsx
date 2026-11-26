"use client";

import { useCallback, useEffect, useState } from "react";
import { useCatalog } from "@/lib/cloud/catalog";
import { getSupabase } from "@/lib/cloud/supabase";
import { Button, Label, Tag, cx, inputCls, useToast } from "../ui";

interface SubIngredient {
  raw_name: string;
  ingredient_id: string | null;
  match_score: number | null;
  quantity: number;
  unit: string;
}
interface Submission {
  id: string;
  source_channel: string;
  origin_type: string;
  license_verified: boolean;
  license_notes: string | null;
  status: "pending_review" | "needs_ingredient_mapping";
  created_at: string;
  normalized_recipe: { title: string; summary: string | null; cuisine_tags: string[]; ingredients: SubIngredient[]; steps: string[]; credit: string | null; origin_ref: string | null };
  automated_checks: { unresolved?: string[]; allergens?: string[]; allergen_mismatch?: string[]; problems?: string[]; warnings?: string[] };
}

const CHANNEL: Record<string, string> = { family_share: "Family share", partner_feed: "Partner feed", permitted_open_source: "Open source", weekly_gap_agent: "Gap agent (Claude)" };
const CATEGORIES = ["produce", "protein", "dairy", "bakery", "grains", "canned", "condiments", "spices", "oils"];
const ALLERGENS = ["gluten", "dairy", "egg", "peanut", "treenut", "fish", "shellfish", "soy", "sesame", "mustard"];

/** Admin → Review: every submitted recipe waits here until a person approves it. */
export function AdminReviewQueue() {
  const toast = useToast();
  const catalog = useCatalog();
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase()!
      .from("recipe_submissions")
      .select("id, source_channel, origin_type, license_verified, license_notes, status, created_at, normalized_recipe, automated_checks")
      .in("status", ["pending_review", "needs_ingredient_mapping"])
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) return setErr(error.message);
    setRows(data as Submission[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const approve = async (s: Submission, level: "source_verified" | "curated") => {
    const { error } = await getSupabase()!.rpc("approve_recipe_submission", { p_submission_id: s.id, p_verification_status: level });
    if (error) return toast({ text: error.message });
    toast({ text: `${s.normalized_recipe.title} is live for everyone.` });
    await Promise.all([load(), catalog.refresh()]);
  };
  const reject = async (s: Submission) => {
    const { error } = await getSupabase()!.rpc("reject_recipe_submission", { p_submission_id: s.id });
    if (error) return toast({ text: error.message });
    toast({ text: "Rejected." });
    load();
  };

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Review queue</h1>
        <p className="text-sm text-muted">Recipes from families, partners and the weekly gap agent. Nothing reaches the shared catalogue until you approve it.</p>
      </div>
      {err && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">Couldn&apos;t load: {err}</p>}
      {rows && !rows.length && <p className="rounded-3xl border border-line bg-surface p-5 text-sm text-muted">Nothing waiting. 🎉</p>}
      <ul className="grid gap-3">
        {rows?.map((s) => {
          const r = s.normalized_recipe;
          const c = s.automated_checks ?? {};
          const unresolved = r.ingredients.filter((i) => !i.ingredient_id);
          const needsLicence = (s.origin_type === "partner" || s.source_channel === "permitted_open_source") && !s.license_verified;
          return (
            <li key={s.id} className="grid gap-3 rounded-3xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-[13px] text-muted">
                    {r.cuisine_tags.join(" · ")} · {new Date(s.created_at).toLocaleDateString()}
                    {r.credit && ` · ${r.credit}`}
                  </p>
                </div>
                <Tag tone={s.origin_type === "claude" ? "saffron" : "neutral"}>{CHANNEL[s.source_channel] ?? s.source_channel}</Tag>
                {s.origin_type === "partner" || s.source_channel === "permitted_open_source" ? (
                  <Tag tone={s.license_verified ? "leaf" : "danger"}>{s.license_verified ? "Licence verified" : "Licence not verified"}</Tag>
                ) : (
                  <Tag>{s.origin_type === "user" ? "Shared with consent" : "No licence needed"}</Tag>
                )}
                {s.status === "needs_ingredient_mapping" && <Tag tone="danger">{unresolved.length} to map</Tag>}
              </div>

              {(c.problems?.length || c.warnings?.length || c.allergen_mismatch?.length) ? (
                <ul className="grid gap-1 rounded-2xl bg-saffron-soft p-3 text-[13px] text-saffron-ink">
                  {c.problems?.map((p) => <li key={p}>⚠ {p}</li>)}
                  {c.warnings?.map((p) => <li key={p}>{p}</li>)}
                  {!!c.allergen_mismatch?.length && <li>Undeclared allergens found: {c.allergen_mismatch.join(", ")}</li>}
                </ul>
              ) : null}
              {!!c.allergens?.length && <p className="text-[13px]">Allergens: {c.allergens.join(", ")}</p>}

              {unresolved.map((i) => (
                <IngredientMapper key={i.raw_name} submissionId={s.id} rawName={i.raw_name} onMapped={load} />
              ))}

              <button type="button" className="justify-self-start text-[13px] font-semibold underline" onClick={() => setOpen(open === s.id ? null : s.id)}>
                {open === s.id ? "Hide recipe" : "Show recipe"}
              </button>
              {open === s.id && (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <ul className="grid gap-1">
                    {r.ingredients.map((i) => (
                      <li key={i.raw_name} className={cx(!i.ingredient_id && "text-danger")}>
                        {i.quantity} {i.unit} {i.raw_name}
                        {i.match_score != null && i.match_score < 1 && <span className="text-muted"> (matched {Math.round(i.match_score * 100)}%)</span>}
                      </li>
                    ))}
                  </ul>
                  <ol className="grid list-decimal gap-1 pl-5">
                    {r.steps.map((st, n) => (
                      <li key={n}>{st.replace(/\{@(\d+)(\*[0-9.]+)?\}/g, (_m, k: string) => r.ingredients[Number(k) - 1]?.raw_name ?? "?").replace(/\s*\[t(\d+)\]/g, " ($1 min)")}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="leaf" size="sm" disabled={s.status !== "pending_review" || needsLicence} onClick={() => approve(s, "curated")}>
                  Approve
                </Button>
                <Button size="sm" disabled={s.status !== "pending_review" || needsLicence} onClick={() => approve(s, "source_verified")}>
                  Approve as source-verified
                </Button>
                <Button size="sm" variant="danger" onClick={() => reject(s)}>
                  Reject
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface Match {
  id: string;
  canonical_name: string;
  category: string;
}

function IngredientMapper({ submissionId, rawName, onMapped }: { submissionId: string; rawName: string; onMapped: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState(rawName);
  const [hits, setHits] = useState<Match[]>([]);
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState("produce");
  const [allergens, setAllergens] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const term = q.trim();
      if (term.length < 2) return setHits([]);
      const sb = getSupabase()!;
      const [{ data: fuzzy }, { data: like }] = await Promise.all([
        sb.rpc("resolve_ingredient_names", { p_names: [term], p_min_score: 0.25 }),
        sb.from("ingredients").select("id, canonical_name, category").ilike("canonical_name", `%${term.replace(/[%_]/g, "")}%`).limit(6),
      ]);
      const ids = new Set<string>();
      const out: Match[] = [];
      for (const f of (fuzzy ?? []) as { ingredient_id: string | null; matched_name: string }[]) if (f.ingredient_id && !ids.has(f.ingredient_id)) ids.add(f.ingredient_id) && out.push({ id: f.ingredient_id, canonical_name: f.matched_name, category: "" });
      for (const l of (like ?? []) as Match[]) if (!ids.has(l.id)) ids.add(l.id) && out.push(l);
      setHits(out.slice(0, 6));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const map = async (ingredientId: string) => {
    const { error } = await getSupabase()!.rpc("map_submission_ingredient", { p_submission_id: submissionId, p_raw_name: rawName, p_ingredient_id: ingredientId, p_add_alias: true });
    if (error) return toast({ text: error.message });
    toast({ text: `Mapped "${rawName}". LUKA will recognise it next time.` });
    onMapped();
  };
  const create = async () => {
    const { data, error } = await getSupabase()!.rpc("create_kb_ingredient", { p_name: q.trim(), p_category: category, p_unit: "g", p_allergens: allergens });
    if (error) return toast({ text: error.message });
    await map(data as string);
  };

  return (
    <div className="grid gap-2 rounded-2xl border border-dashed border-line p-3">
      <Label htmlFor={`map-${submissionId}-${rawName}`}>
        Map <strong>&ldquo;{rawName}&rdquo;</strong> to an ingredient
      </Label>
      <input id={`map-${submissionId}-${rawName}`} className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {hits.map((h) => (
          <Button key={h.id} size="sm" onClick={() => map(h.id)}>
            {h.canonical_name}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setCreating(!creating)}>
          {creating ? "Cancel" : "New ingredient…"}
        </Button>
      </div>
      {creating && (
        <div className="grid gap-2">
          <select aria-label="Category" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <fieldset className="flex flex-wrap gap-2 text-[13px]">
            <legend className="mb-1 text-[13px] text-muted">Contains (check the label — never guess)</legend>
            {ALLERGENS.map((a) => (
              <label key={a} className="flex items-center gap-1">
                <input type="checkbox" checked={allergens.includes(a)} onChange={() => setAllergens((c) => (c.includes(a) ? c.filter((x) => x !== a) : [...c, a]))} />
                {a}
              </label>
            ))}
          </fieldset>
          <Button size="sm" variant="primary" className="justify-self-start" onClick={create} disabled={q.trim().length < 2}>
            Create &ldquo;{q.trim()}&rdquo; and map
          </Button>
        </div>
      )}
    </div>
  );
}
