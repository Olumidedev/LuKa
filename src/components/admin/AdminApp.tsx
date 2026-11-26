"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { aiGenerateRecipes, useAIEnabled } from "@/lib/ai/client";
import { useAuth } from "@/lib/cloud/auth";
import { useCatalog } from "@/lib/cloud/catalog";
import { getSupabase } from "@/lib/cloud/supabase";
import { ALL_COUNTRIES } from "@/lib/data/countries";
import {
  loadConfigRows,
  loadOverview,
  loadRecent,
  loadUsers,
  saveConfig,
  setAdmin,
  type AdminUser,
  type Overview,
  type RecentItem,
} from "@/lib/cloud/admin";
import { mergeConfig, type AppConfig } from "@/lib/cloud/config";
import { Button, Label, Segmented, Tag, cx, inputCls, useToast } from "../ui";
import { BarList, ColumnChart, Stat } from "./charts";
import { DataSection } from "./DataSection";
import { AdminReviewQueue } from "./ReviewQueue";

type Section = "overview" | "users" | "recipes" | "review" | "data" | "issues" | "settings";

const EVENT_LABEL: Record<string, string> = {
  app_opened: "Opened the app",
  onboarding_done: "Finished setup",
  plan_built: "Built or reshuffled a plan",
  day_skipped: "Skipped a day",
  meal_swapped: "Swapped a meal",
  cook_started: "Started Cook Mode",
  cook_finished: "Finished a recipe",
  handoff_sent: "Sent a handoff",
  list_copied: "Copied a shopping list",
  item_in_cart: "Ticked off groceries",
  pantry_scanned: "Scanned a fridge",
  recipe_added: "Added a recipe",
  ai_recipes_generated: "Generated AI recipes",
  signed_in: "Signed in",
  household_joined: "Joined a household",
  invite_created: "Invited someone",
  cook_feedback: "Rated a meal",
  souschef_asked: "Asked LUKA",
  recipe_shared: "Shared a family recipe",
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

/** The admin area, shown as a tab inside the main app to admins only. */
export default function AdminPanel() {
  const [section, setSection] = useState<Section>("overview");
  const { user } = useAuth();
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Admin · only admins see this tab</p>
        <Segmented<Section>
          value={section}
          onChange={setSection}
          options={[
            { value: "overview", label: "Overview" },
            { value: "users", label: "Users" },
            { value: "recipes", label: "Recipes" },
            { value: "review", label: "Review" },
            { value: "data", label: "Data" },
            { value: "issues", label: "Errors & feedback" },
            { value: "settings", label: "Settings" },
          ]}
        />
      </div>
      {section === "overview" && <OverviewSection />}
      {section === "users" && <UsersSection me={user?.id ?? ""} />}
      {section === "recipes" && <RecipesSection />}
      {section === "review" && <AdminReviewQueue />}
      {section === "data" && <DataSection />}
      {section === "issues" && <IssuesSection />}
      {section === "settings" && <SettingsSection />}
    </div>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setErr("");
    fn()
      .then((d) => live && setData(d))
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, err, reload: useCallback(() => setN((x) => x + 1), []) };
}

function ErrorNote({ err }: { err: string }) {
  return err ? <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">Couldn&apos;t load: {err}</p> : null;
}

/* ── Overview ─────────────────────────────────────────── */
function OverviewSection() {
  const [days, setDays] = useState(30);
  const { data, err, reload } = useLoad<Overview>(() => loadOverview(days), [days]);

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Overview</h1>
        <div className="flex items-center gap-2">
          <Segmented<string>
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
          />
          <Button size="sm" variant="ghost" onClick={reload}>
            Refresh
          </Button>
        </div>
      </div>
      <ErrorNote err={err} />
      {data && <OverviewBody o={data} />}
    </div>
  );
}

function OverviewBody({ o }: { o: Overview }) {
  const t = o.totals;
  const daily = o.daily.map((d) => ({ label: shortDate(d.day), devices: d.devices, signups: d.signups }));
  const f = o.funnel;
  const pct = (n: number) => (f.opened ? `${Math.round((n / f.opened) * 100)}%` : "");
  const events = Object.entries(o.events)
    .filter(([k]) => k !== "app_opened")
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ label: EVENT_LABEL[k] ?? k, value: v }));
  const planLabel: Record<string, string> = { "5day": "5 weekdays", "14day": "14 days", instant: "Instant meal" };

  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Accounts" value={t.users} sub={`${t.new_users.toLocaleString()} new in ${o.days} days`} />
        <Stat label="Active devices" value={t.active_devices_7d} sub={`last 7 days · ${t.active_devices.toLocaleString()} in ${o.days}`} />
        <Stat label="Households" value={t.households} sub={`${t.shared_households.toLocaleString()} shared by 2+ people`} />
        <Stat label="Problems reported" value={t.errors + t.feedback} sub={`${t.errors} crashes · ${t.feedback} notes`} />
      </section>

      <section className="grid gap-8 rounded-3xl border border-line bg-surface p-5 lg:grid-cols-2">
        <ColumnChart title="Active devices per day" unit="devices" data={daily.map((d) => ({ label: d.label, value: d.devices }))} />
        <ColumnChart title="New accounts per day" unit="accounts" data={daily.map((d) => ({ label: d.label, value: d.signups }))} />
      </section>

      <section className="grid gap-8 rounded-3xl border border-line bg-surface p-5 lg:grid-cols-2">
        <BarList
          title="Journey"
          note="Devices that reached each step at least once"
          unit="devices"
          rows={[
            { label: "Opened LUKA", value: f.opened },
            { label: "Finished setup", value: f.onboarded, hint: pct(f.onboarded) },
            { label: "Built a plan", value: f.planned, hint: pct(f.planned) },
            { label: "Used the list", value: f.shopped, hint: pct(f.shopped) },
            { label: "Started cooking", value: f.cooked, hint: pct(f.cooked) },
          ]}
        />
        <BarList title="Feature use" note="Times each action happened" unit="times" rows={events} />
      </section>

      <section className="grid gap-8 rounded-3xl border border-line bg-surface p-5 lg:grid-cols-2">
        <BarList
          title="Plans built, by type"
          unit="plans"
          rows={Object.entries(o.plan_types)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => ({ label: planLabel[k] ?? k, value: v }))}
        />
        <BarList title="Most-picked cuisines" note="Across signed-in households" unit="households" rows={o.cuisines.map((c) => ({ label: c.name, value: c.households }))} />
      </section>
      <p className="text-[13px] text-muted">
        Device counts include people who never sign in. Each device gets a random ID; people can switch this off under Household → Share anonymous usage stats.
      </p>
    </>
  );
}

/* ── Users ───────────────────────────────────────────── */
function UsersSection({ me }: { me: string }) {
  const toast = useToast();
  const { data, err, reload } = useLoad<AdminUser[]>(loadUsers, []);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const rows = (data ?? []).filter((u) => !q || (u.email ?? "").toLowerCase().includes(q.toLowerCase()));

  const toggle = async (u: AdminUser) => {
    try {
      await setAdmin(u.id, !u.is_admin);
      toast({ text: `${u.email} is ${u.is_admin ? "no longer an admin" : "now an admin"}.` });
      setConfirm(null);
      reload();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "That didn't work." });
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Users</h1>
          <p className="text-sm text-muted">{data ? `${data.length} accounts` : "Loading…"}. Households and plans stay private; only account details show here.</p>
        </div>
        <input id="user-search" className={cx(inputCls, "max-w-xs")} placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorNote err={err} />
      <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-sunk text-[12px] uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Email</th>
              <th className="px-4 py-2.5 font-semibold">Sign-in</th>
              <th className="px-4 py-2.5 font-semibold">Joined</th>
              <th className="px-4 py-2.5 font-semibold">Last active</th>
              <th className="px-4 py-2.5 text-right font-semibold">Households</th>
              <th className="px-4 py-2.5 font-semibold">Role</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="max-w-64 truncate px-4 py-2.5 font-medium">{u.email ?? "—"}</td>
                <td className="px-4 py-2.5 capitalize">{u.provider}</td>
                <td className="px-4 py-2.5">{shortDate(u.created_at)}</td>
                <td className="px-4 py-2.5">{when(u.last_sign_in_at)}</td>
                <td className="px-4 py-2.5 text-right">{u.households}</td>
                <td className="px-4 py-2.5">
                  {confirm === u.id ? (
                    <span className="flex items-center gap-2">
                      <Button size="sm" variant={u.is_admin ? "danger" : "primary"} onClick={() => toggle(u)}>
                        {u.is_admin ? "Remove admin" : "Make admin"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {u.is_admin ? <Tag tone="saffron">Admin</Tag> : <span className="text-muted">Member</span>}
                      {u.id !== me && (
                        <button type="button" className="text-[12px] font-semibold text-muted underline hover:text-fg" onClick={() => setConfirm(u.id)}>
                          Change
                        </button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {data && !rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-muted">
                  No accounts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Errors & feedback ───────────────────────────────── */
function IssuesSection() {
  const errors = useLoad<RecentItem[]>(() => loadRecent("client_error"), []);
  const feedback = useLoad<RecentItem[]>(() => loadRecent("feedback"), []);

  const grouped = useMemo(() => {
    const m = new Map<string, { message: string; count: number; last: string; source: string; path: string }>();
    for (const e of errors.data ?? []) {
      const message = String(e.props.message ?? "Unknown error");
      const g = m.get(message) ?? { message, count: 0, last: e.created_at, source: String(e.props.source ?? ""), path: e.path ?? "" };
      g.count++;
      if (e.created_at > g.last) g.last = e.created_at;
      m.set(message, g);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [errors.data]);

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">Crashes</h1>
            <p className="text-sm text-muted">Errors people&apos;s browsers hit, grouped by message. Fixes ship as a pull request on GitHub, then deploy automatically.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={errors.reload}>
            Refresh
          </Button>
        </div>
        <ErrorNote err={errors.err} />
        {errors.data && !grouped.length && <p className="rounded-2xl bg-leaf-soft px-4 py-3 text-sm text-leaf">No crashes reported.</p>}
        <ul className="grid gap-2">
          {grouped.map((g) => (
            <li key={g.message} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <code className="min-w-0 break-words text-[13px] font-semibold text-danger">{g.message}</code>
                <span className="text-[13px] text-muted tnum">
                  {g.count}× · last {when(g.last)}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-muted">
                {g.path || "/"}
                {g.source && ` · ${g.source}`}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold">Feedback</h2>
            <p className="text-sm text-muted">Sent from Household → Report a problem or share an idea.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={feedback.reload}>
            Refresh
          </Button>
        </div>
        <ErrorNote err={feedback.err} />
        {feedback.data && !feedback.data.length && <p className="text-sm text-muted">No feedback yet.</p>}
        <ul className="grid gap-2">
          {(feedback.data ?? []).map((f, i) => (
            <li key={`${f.created_at}-${i}`} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                <Tag tone={f.props.kind === "problem" ? "danger" : f.props.kind === "idea" ? "leaf" : "neutral"}>
                  {f.props.kind === "problem" ? "Problem" : f.props.kind === "idea" ? "Idea" : "Other"}
                </Tag>
                <span>{f.user_email ?? "Anonymous"}</span>
                <span>· {when(f.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{String(f.props.message ?? "")}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ── Settings ────────────────────────────────────────── */
const FEATURES: { key: keyof AppConfig["features"]; label: string; hint: string }[] = [
  { key: "instant", label: "Instant meal", hint: "The one-dish-right-now plan option" },
  { key: "fourteen_day", label: "14-day plans", hint: "Two-week planning with two shops" },
  { key: "handoff", label: "Partner handoff", hint: "Send a recipe to someone else to cook" },
  { key: "voice", label: "Voice commands in Cook Mode", hint: "“Next”, “repeat”, timers by voice" },
  { key: "ai_recipes", label: "AI recipes", hint: "Generate by country and paste-a-recipe (needs the Gemini key)" },
  { key: "fridge_scan", label: "Fridge photo scan", hint: "Reads what's at home from a photo (needs the Gemini key)" },
];

function SettingsSection() {
  const toast = useToast();
  const { data, err } = useLoad(loadConfigRows, []);
  const [c, setC] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setC(mergeConfig(data));
  }, [data]);
  const updated = data?.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null);

  if (err) return <ErrorNote err={err} />;
  if (!c) return <p className="text-muted">Loading…</p>;

  const save = async () => {
    setSaving(true);
    try {
      await saveConfig(c);
      toast({ text: "Saved. People see the change the next time they open LUKA." });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid max-w-2xl gap-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">Changes apply to everyone without a redeploy.{updated && ` Last saved ${when(updated)}.`}</p>
      </div>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Announcement banner</h2>
        <div>
          <Label htmlFor="announce">Message (leave empty to hide)</Label>
          <input
            id="announce"
            maxLength={240}
            className={inputCls}
            placeholder="e.g. New: 40 Caribbean recipes just landed"
            value={c.announcement.text}
            onChange={(e) => setC({ ...c, announcement: { ...c.announcement, text: e.target.value } })}
          />
        </div>
        <Segmented<"info" | "warning">
          value={c.announcement.tone}
          onChange={(tone) => setC({ ...c, announcement: { ...c.announcement, tone } })}
          options={[
            { value: "info", label: "News" },
            { value: "warning", label: "Heads-up" },
          ]}
        />
        {c.announcement.text && (
          <div className={cx("rounded-xl px-4 py-2.5 text-center text-sm font-medium", c.announcement.tone === "warning" ? "bg-saffron-soft text-saffron-ink" : "bg-leaf-soft text-leaf")}>
            {c.announcement.text}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Features</h2>
        {FEATURES.map((f) => (
          <label key={f.key} className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--saffron)]"
              checked={c.features[f.key]}
              onChange={(e) => setC({ ...c, features: { ...c.features, [f.key]: e.target.checked } })}
            />
            <span>
              <b className="font-semibold">{f.label}</b>
              <span className="block text-muted">{f.hint}</span>
            </span>
          </label>
        ))}
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Defaults for new households</h2>
        <div className="max-w-xs">
          <Label htmlFor="takeout-default">Takeout spend per person ($)</Label>
          <input
            id="takeout-default"
            inputMode="decimal"
            className={inputCls}
            value={c.defaults.takeout_per_person}
            onChange={(e) => setC({ ...c, defaults: { takeout_per_person: Math.max(0, Number(e.target.value) || 0) } })}
          />
        </div>
      </section>

      <div className="flex items-center gap-3 border-t border-line pt-5">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <section className="grid gap-2 rounded-2xl bg-sunk p-4 text-sm">
        <h2 className="font-semibold">Fixing bugs and adding features</h2>
        <p className="text-muted">Code changes go through GitHub pull requests; merging one redeploys LUKA automatically once Vercel is connected to the repo.</p>
        <ul className="grid gap-1">
          <li>
            <a className="font-semibold underline" href="https://github.com/Olumidedev/LuKa/pulls" target="_blank" rel="noopener noreferrer">
              GitHub pull requests
            </a>
          </li>
          <li>
            <a className="font-semibold underline" href="https://vercel.com/luka-dbb6/luka" target="_blank" rel="noopener noreferrer">
              Vercel deployments and logs
            </a>
          </li>
          <li>
            <a className="font-semibold underline" href="https://supabase.com/dashboard/project/sxezjykpwtyrndsdrili" target="_blank" rel="noopener noreferrer">
              Supabase database and auth
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}

/* ── Recipes (shared catalog) ────────────────────────── */
interface CatalogRow {
  id: string;
  title: string;
  cuisine_tags: string[];
  meals: string[];
  status: "live" | "hidden";
  origin_type: string;
  verification_status: "unverified" | "source_verified" | "curated";
  avg_rating: number | null;
  rating_count: number;
  created_at: string;
}

async function loadCatalogRows(): Promise<CatalogRow[]> {
  const { data, error } = await getSupabase()!
    .from("recipes")
    .select("id, title, cuisine_tags, meals, status, origin_type, verification_status, avg_rating, rating_count, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return data as CatalogRow[];
}

function RecipesSection() {
  const toast = useToast();
  const ai = useAIEnabled();
  const catalog = useCatalog();
  const { data, err, reload } = useLoad<CatalogRow[]>(loadCatalogRows, []);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const rows = (data ?? []).filter((r) => !q || `${r.title} ${r.cuisine_tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data ?? []) if (r.status === "live") for (const c of r.cuisine_tags) m.set(c, (m.get(c) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const after = async (msg: string) => {
    toast({ text: msg });
    reload();
    await catalog.refresh();
  };

  const setStatus = async (r: CatalogRow, status: "live" | "hidden") => {
    const { error } = await getSupabase()!.from("recipes").update({ status }).eq("id", r.id);
    if (error) return toast({ text: error.message });
    await after(status === "hidden" ? `${r.title} is hidden from everyone.` : `${r.title} is live again.`);
  };

  const verify = async (r: CatalogRow) => {
    const { error } = await getSupabase()!.from("recipes").update({ verification_status: "curated" }).eq("id", r.id);
    if (error) return toast({ text: error.message });
    await after(`${r.title} is verified.`);
  };

  const remove = async (r: CatalogRow) => {
    const { error } = await getSupabase()!.from("recipes").delete().eq("id", r.id);
    setConfirm(null);
    if (error) return toast({ text: error.message });
    await after(`Deleted ${r.title}.`);
  };

  const generate = async () => {
    if (!ALL_COUNTRIES.includes(country)) return toast({ text: "Choose a country from the list." });
    setBusy(true);
    try {
      const res = await aiGenerateRecipes(country, ["b", "l", "d"], 6);
      await after(`Claude wrote ${res.recipes.length} new ${country} recipes.`);
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Recipes</h1>
        <p className="text-sm text-muted">
          The shared catalog Claude writes into. Hidden recipes disappear from everyone&apos;s plans the next time they open LUKA. Unverified recipes are planned less often until someone checks them.
        </p>
      </div>

      <section className="grid gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Write new recipes</h2>
        {!ai && <p className="text-sm text-muted">Add ANTHROPIC_API_KEY in Vercel to switch this on.</p>}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-56">
            <Label htmlFor="admin-gen-country">Country</Label>
            <input id="admin-gen-country" list="admin-countries" className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Burkina Faso" />
            <datalist id="admin-countries">
              {ALL_COUNTRIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <Button variant="primary" onClick={generate} disabled={!ai || busy}>
            {busy ? "Claude is writing…" : "Write 6 recipes"}
          </Button>
        </div>
        {byCountry.length > 0 && (
          <p className="text-[13px] text-muted">
            Live by country: {byCountry.slice(0, 12).map(([c, n]) => `${c} ${n}`).join(" · ")}
          </p>
        )}
      </section>

      <ErrorNote err={err} />
      <input id="admin-recipe-search" className={cx(inputCls, "max-w-xs")} placeholder="Search recipes or countries" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className={cx("font-semibold", r.status === "hidden" && "text-muted line-through")}>{r.title}</span>
                {r.status === "hidden" && <Tag tone="danger">Hidden</Tag>}
                <Tag>{({ built_in: "Built-in", claude: "Claude", user: "Family", partner: "Partner" } as Record<string, string>)[r.origin_type] ?? r.origin_type}</Tag>
                {r.verification_status === "unverified" ? <Tag tone="danger">Unverified</Tag> : <Tag>{r.verification_status === "curated" ? "Curated" : "Source-verified"}</Tag>}
                {r.rating_count > 0 && <span className="text-[13px] text-muted">★ {Number(r.avg_rating).toFixed(1)} ({r.rating_count})</span>}
              </p>
              <p className="text-[13px] text-muted">
                {r.cuisine_tags.join(" × ")} · {r.meals.map((m) => ({ b: "Breakfast", l: "Lunch", d: "Dinner" })[m] ?? m).join(", ")} · added {shortDate(r.created_at)}
              </p>
            </div>
            {confirm === r.id ? (
              <span className="flex gap-2">
                <Button size="sm" variant="danger" onClick={() => remove(r)}>
                  Delete for good
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <span className="flex gap-2">
                {r.verification_status === "unverified" && (
                  <Button size="sm" onClick={() => verify(r)}>
                    Verify
                  </Button>
                )}
                <Button size="sm" onClick={() => setStatus(r, r.status === "live" ? "hidden" : "live")}>
                  {r.status === "live" ? "Hide" : "Show"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(r.id)}>
                  Delete
                </Button>
              </span>
            )}
          </li>
        ))}
        {data && !rows.length && <li className="px-4 py-6 text-sm text-muted">{data.length ? "No recipes match." : "No AI recipes yet. Write some above, or pick a country in the app and LUKA will write them automatically."}</li>}
      </ul>
    </div>
  );
}
