"use client";

import { useMemo, useState } from "react";
import { useAIEnabled } from "@/lib/ai/client";
import { useProfile } from "@/lib/cloud/profile";
import { useCloud } from "@/lib/cloud/sync";
import { dayLabel, toISO } from "@/lib/engine/dates";
import { MEALS, MEAL_LABEL, prepTips } from "@/lib/engine/planner";
import { computeShopping, planEntries, weeklyTrip } from "@/lib/engine/shopping";
import { regenerate } from "@/lib/state/actions";
import { useStore } from "@/lib/state/store";
import type { MealType } from "@/lib/types";
import { AskLukaSheet } from "./kb/AskLuka";
import { useUI } from "./uiState";
import { Button, Tag, cx, money } from "./ui";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Landing page after sign-in: today at a glance, in a calm voice. */
export function HomeView() {
  const { state, ctx, update } = useStore();

  const ui = useUI();
  const cloud = useCloud();
  const ai = useAIEnabled();
  const [asking, setAsking] = useState(false);
  const plan = state.plan;
  const { name } = useProfile();
  const today = toISO(new Date());

  const trips = useMemo(() => (plan ? computeShopping(ctx, planEntries(ctx, plan), weeklyTrip) : []), [ctx, plan]);
  const tips = useMemo(() => (plan ? prepTips(ctx, plan) : new Map<string, string[]>()), [ctx, plan]);

  const idx = plan ? plan.days.findIndex((d) => d.date === today) : -1;
  const dayIdx = plan ? (idx >= 0 ? idx : plan.days.findIndex((d) => d.date > today)) : -1;
  const day = plan && dayIdx >= 0 ? plan.days[dayIdx] : null;
  const isToday = idx >= 0;
  const recipeOf = (m: MealType) => (day?.meals[m].recipeId ? ctx.byId.get(day.meals[m].recipeId!) : undefined);
  const dinner = recipeOf("d");
  const cookName = (id?: string) => state.members.find((m) => m.id === id)?.name;
  const total = trips.reduce((s, t) => s + t.total, 0);
  const fresh = trips.filter((t) => t.freshUsed != null);
  const freshPct = fresh.length ? Math.round((fresh.reduce((s, t) => s + (t.freshUsed ?? 0), 0) / fresh.length) * 100) : null;

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-sm text-muted">{dayLabel(today).dow}, {dayLabel(today).date}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">
          {greeting()}
          {name ? `, ${name}` : ""}.
        </h1>
        <p className="mt-1 text-muted">{dinner ? (isToday ? "Here's what's cooking today." : "Your plan starts soon. Here's the first day.") : "Let's plan something good to eat."}</p>
      </header>

      {ui.topUp.working && (
        <p className="rounded-2xl bg-leaf-soft px-4 py-3 text-sm text-leaf" role="status">
          LUKA is writing new {ui.topUp.working} recipes for you. Your plan will update when they&apos;re ready.
        </p>
      )}

      {day && dinner ? (
        <section className="grid gap-4 rounded-3xl bg-fg p-5 text-bg sm:p-7">
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] opacity-75">
            {isToday ? "Tonight" : `${dayLabel(day.date).dow} dinner`}
            {day.meals.d.cookId && <span>· {cookName(day.meals.d.cookId)} cooks</span>}
          </div>
          <h2 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{dinner.name}</h2>
          <p className="opacity-80">
            {dinner.countries.join(" × ")} · {dinner.activeMin} min hands-on · {dinner.totalMin} min total
          </p>
          {tips.get(`${dayIdx}-d`)?.map((t) => (
            <p key={t} className="text-sm opacity-80">
              {t}
            </p>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" onClick={() => ui.openMeal({ kind: "slot", day: dayIdx, meal: "d" })}>
              See recipe and cook
            </Button>
            <Button size="lg" className="!border-white/20 !bg-transparent !text-bg hover:!bg-white/10 dark:!border-black/20 dark:hover:!bg-black/10" onClick={() => ui.setTab("plan")}>
              Whole plan
            </Button>
          </div>
        </section>
      ) : (
        <section className="grid justify-items-start gap-3 rounded-3xl border border-line bg-surface p-6">
          <h2 className="font-display text-2xl font-semibold">{state.planType === "instant" ? "Need something now?" : "No meals planned yet"}</h2>
          <p className="text-muted">{state.planType === "instant" ? "Tell LUKA what's in your kitchen and get a dish you can make tonight." : "Build a plan and LUKA will chain your groceries across the week."}</p>
          <Button variant="primary" onClick={() => ui.setTab("plan")}>
            {state.planType === "instant" ? "Find a dish" : "Build my plan"}
          </Button>
        </section>
      )}

      {day && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{isToday ? "Today" : dayLabel(day.date).dow}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {MEALS.map((m) => {
              const r = recipeOf(m);
              const leftover = day.meals[m].leftoverOf != null;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={!r}
                  onClick={() => ui.openMeal({ kind: "slot", day: dayIdx, meal: m })}
                  className={cx("rounded-2xl border border-line p-4 text-left transition hover:border-muted", leftover ? "bg-sunk" : "bg-surface")}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{MEAL_LABEL[m]}</span>
                  <span className="mt-1 block font-display text-[17px] font-semibold leading-snug">{r?.name ?? "Nothing planned"}</span>
                  {r && <span className="mt-1 block text-[12px] text-muted">{leftover ? "Leftovers · just reheat" : `${r.activeMin} min hands-on`}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {plan && (
        <section className="grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={() => ui.setTab("groceries")} className="rounded-2xl border border-line bg-surface p-4 text-left hover:border-muted">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Groceries</span>
            <span className="mt-1 block font-display text-2xl font-semibold tnum">{money(total)}</span>
            <span className="text-[13px] text-muted">{trips.length > 1 ? `${trips.length} shops` : "One shop"} · open list</span>
          </button>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Fresh food used</span>
            <span className="mt-1 block font-display text-2xl font-semibold tnum">{freshPct != null ? `${freshPct}%` : "—"}</span>
            <span className="text-[13px] text-muted">Bought once, cooked across meals</span>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Recipes for you</span>
            <span className="mt-1 block font-display text-2xl font-semibold tnum">{ctx.recipes.filter((r) => ctx.gates.get(r.id)?.ok).length}</span>
            <span className="text-[13px] text-muted">
              Safe for your household
              {ui.topUp.added > 0 && <Tag tone="leaf">+{ui.topUp.added} new</Tag>}
            </span>
          </div>
        </section>
      )}

      <section className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            update((d) => regenerate(d, { type: "instant" }));
            ui.setTab("plan");
          }}
        >
          Plan an instant meal
        </Button>
        {cloud.household && ai && (
          <Button variant="leaf" onClick={() => setAsking(true)}>
            Ask LUKA
          </Button>
        )}
        <Button onClick={() => ui.setTab("recipes")}>Add a family recipe</Button>
        <Button onClick={() => ui.setTab("account")}>Invite your household</Button>
      </section>
      <AskLukaSheet open={asking} onClose={() => setAsking(false)} />
    </div>
  );
}
