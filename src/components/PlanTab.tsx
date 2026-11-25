"use client";

import { useMemo } from "react";
import { pickLabel } from "@/lib/data/countries";
import { uncoveredCountries } from "@/lib/engine/cuisine";
import { dayLabel, mealForNow, toISO } from "@/lib/engine/dates";
import { badges, perServing, BADGE_LABEL } from "@/lib/engine/nutrition";
import { MEALS, MEAL_LABEL, prepTips, skipDay } from "@/lib/engine/planner";
import { computeShopping, planEntries, weeklyTrip } from "@/lib/engine/shopping";
import { regenerate } from "@/lib/state/actions";
import { useStore } from "@/lib/state/store";
import type { MealType, PlanType } from "@/lib/types";
import { InstantPanel } from "./InstantPanel";
import { PLAN_OPTIONS } from "./Onboarding";
import { useUI } from "./uiState";
import { Button, Segmented, Tag, cx, money, useToast } from "./ui";

export function PlanTab() {
  const { state, ctx, update, replace } = useStore();
  const ui = useUI();
  const toast = useToast();
  const plan = state.plan;

  const shopping = useMemo(() => (plan ? computeShopping(ctx, planEntries(ctx, plan), weeklyTrip) : []), [ctx, plan]);
  const tips = useMemo(() => (plan ? prepTips(ctx, plan) : new Map<string, string[]>()), [ctx, plan]);
  const uncovered = uncoveredCountries(ctx.recipes, state.cuisines);
  const memberName = (id?: string) => state.members.find((m) => m.id === id)?.name;

  const setType = (t: PlanType) => update((d) => regenerate(d, { type: t, reshuffle: !d.plan || d.plan.type !== t }));

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Segmented<PlanType> value={state.planType} onChange={setType} options={PLAN_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Cooking from</span>
        <button type="button" onClick={ui.openCuisines} className="rounded-full border border-line bg-surface px-3 py-1 font-semibold hover:border-muted">
          {state.cuisines.length ? state.cuisines.map(pickLabel).join(" · ") : "Any cuisine"}
        </button>
      </div>
    </div>
  );

  if (state.planType === "instant") {
    return (
      <div className="grid gap-6">
        {header}
        <InstantPanel />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="grid gap-6">
        {header}
        <Button variant="primary" onClick={() => update((d) => regenerate(d, { reshuffle: true }))}>
          Build my plan
        </Button>
      </div>
    );
  }

  let meals = 0;
  let sessions = 0;
  let leftovers = 0;
  for (const d of plan.days) {
    if (d.skipped) continue;
    for (const m of MEALS) {
      const s = d.meals[m];
      if (!s.recipeId) continue;
      meals++;
      if (s.leftoverOf != null) leftovers++;
      else sessions++;
    }
  }
  const total = shopping.reduce((s, t) => s + t.total, 0);
  const freshBought = shopping.reduce((s, t) => s + (t.freshUsed != null ? 1 : 0), 0);
  const fresh = freshBought ? shopping.reduce((s, t) => s + (t.freshUsed ?? 0), 0) / freshBought : null;
  const today = toISO(new Date());

  const doSkip = (i: number) => {
    const before = state;
    let dropped: string[] = [];
    update((d) => {
      const r = skipDay(d.plan!, i);
      d.plan = r.plan;
      dropped = r.dropped;
    });
    const { dow } = dayLabel(plan.days[i].date);
    setTimeout(() => {
      const names = dropped.map((id) => ctx.byId.get(id)?.name).filter(Boolean);
      toast({
        text: `${dow}'s meals moved to the next day.${names.length ? ` ${names.join(", ")} came off the end.` : ""}`,
        action: { label: "Undo", run: () => replace(before) },
      });
    });
  };

  return (
    <div className="grid gap-6">
      {header}

      <section className="rounded-3xl bg-fg px-5 py-5 text-bg sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] opacity-70">{plan.type === "5day" ? "This working week" : "Next 14 days"}</p>
            <p className="mt-1 font-display text-2xl font-semibold leading-snug sm:text-[28px]">
              {meals} meals from {sessions} cooking sessions
            </p>
          </div>
          <Button variant="primary" onClick={() => ui.setTab("groceries")}>
            Shopping list · {money(total)}
          </Button>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 text-sm dark:border-black/15">
          <div>
            <dt className="opacity-70">Leftover lunches</dt>
            <dd className="tnum text-lg font-semibold">{leftovers}</dd>
          </div>
          <div>
            <dt className="opacity-70">Fresh food used</dt>
            <dd className="tnum text-lg font-semibold">{fresh != null ? `${Math.round(fresh * 100)}%` : "—"}</dd>
          </div>
          <div>
            <dt className="opacity-70">{shopping.length > 1 ? "Shops" : "Shop"}</dt>
            <dd className="tnum text-lg font-semibold">{shopping.length}</dd>
          </div>
        </dl>
      </section>

      {uncovered.length > 0 && (
        <p className="rounded-2xl bg-saffron-soft px-4 py-3 text-sm text-saffron-ink">
          No {uncovered.join(", ")} recipes in your library yet, so Luka is using dishes from the same region.{" "}
          <button type="button" className="font-semibold underline" onClick={() => ui.setTab("recipes")}>
            Add your own or generate some
          </button>
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Tap a meal for the recipe, swaps and cooking mode.</p>
        <Button size="sm" variant="ghost" onClick={() => update((d) => regenerate(d, { reshuffle: true }))}>
          Reshuffle unpinned
        </Button>
      </div>

      <ol className="grid gap-0 divide-y divide-line rounded-3xl border border-line bg-surface">
        {plan.days.map((day, i) => {
          const { dow, date } = dayLabel(day.date);
          const weekStart = plan.type === "14day" && i % 7 === 0;
          return (
            <li key={day.date}>
              {weekStart && (
                <div className="flex items-center justify-between bg-sunk px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted first:rounded-t-3xl sm:px-6">
                  <span>Week {i / 7 + 1}</span>
                  <span>Shop {i / 7 + 1}: {money(shopping[i / 7]?.total ?? 0)}</span>
                </div>
              )}
              <div className="grid gap-3 px-4 py-4 sm:grid-cols-[88px_1fr] sm:px-6">
                <div className="flex items-baseline justify-between sm:block">
                  <div className="flex items-baseline gap-2 sm:block">
                    <p className={cx("font-display text-xl font-semibold", day.date === today && "text-saffron")}>{dow}</p>
                    <p className="text-[13px] text-muted">{day.date === today ? "Today" : date}</p>
                  </div>
                  {!day.skipped && (
                    <button type="button" className="text-[12px] font-medium text-muted hover:text-fg sm:mt-2" onClick={() => doSkip(i)} title="Eating out? Push this day's meals to tomorrow">
                      Skip day
                    </button>
                  )}
                </div>
                {day.skipped ? (
                  <p className="self-center text-sm text-muted">Day off. Meals moved to the next day.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {MEALS.map((m) => (
                      <MealTile key={m} day={i} meal={m} tips={tips.get(`${i}-${m}`)} cookName={memberName(day.meals[m].cookId)} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MealTile({ day, meal, tips, cookName }: { day: number; meal: MealType; tips?: string[]; cookName?: string }) {
  const { state, ctx } = useStore();
  const ui = useUI();
  const slot = state.plan!.days[day].meals[meal];
  const recipe = slot.recipeId ? ctx.byId.get(slot.recipeId) : undefined;
  const isNow = meal === mealForNow() && state.plan!.days[day].date === toISO(new Date());
  const leftover = slot.leftoverOf != null;
  const b = recipe && state.settings.nutrition !== "off" ? badges(perServing(recipe, ctx.ings)).slice(0, 2) : [];

  return (
    <button
      type="button"
      onClick={() => ui.openMeal({ kind: "slot", day, meal })}
      className={cx(
        "group flex min-w-0 flex-col rounded-2xl border p-3 text-left transition hover:border-muted",
        isNow ? "border-saffron" : "border-line",
        leftover ? "bg-sunk" : "bg-surface",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {MEAL_LABEL[meal]}
        {slot.pinned && <span title="Pinned">· pinned</span>}
        {isNow && <span className="text-saffron">· now</span>}
      </span>
      {recipe ? (
        <>
          <span className="mt-1 font-display text-[16px] font-semibold leading-snug">{recipe.name}</span>
          <span className="mt-1 text-[12px] text-muted">
            {leftover ? "Leftovers · just reheat" : `${recipe.activeMin} min hands-on${cookName ? ` · ${cookName}` : ""}`}
          </span>
          {!leftover && b.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1">
              {b.map((x) => (
                <Tag key={x} tone="leaf">
                  {BADGE_LABEL[x]}
                </Tag>
              ))}
            </span>
          )}
          {tips?.map((t) => (
            <span key={t} className="mt-2 border-t border-dashed border-line pt-2 text-[12px] leading-snug text-saffron-ink">
              <b className="font-semibold">Prep · </b>
              {t}
            </span>
          ))}
        </>
      ) : (
        <span className="mt-1 text-sm text-muted">Nothing fits your household&apos;s rules here. Add a recipe.</span>
      )}
    </button>
  );
}
