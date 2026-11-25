"use client";

import { useEffect } from "react";
import { mealForNow } from "@/lib/engine/dates";
import { instantOptions } from "@/lib/engine/planner";
import { useStore } from "@/lib/state/store";
import type { MealType } from "@/lib/types";
import { PantryBar } from "./PantryBar";
import { useUI } from "./uiState";
import { Button, Segmented, Tag, money } from "./ui";

export function InstantPanel() {
  const { state, ctx, update } = useStore();
  const ui = useUI();
  const { meal, maxMin, pickId } = state.instant;

  useEffect(() => {
    if (!state.instant.pickId) {
      const now = mealForNow();
      if (now !== state.instant.meal) update((d) => void (d.instant.meal = now));
    }
    // only on first show
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = instantOptions(ctx, meal, maxMin);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<MealType>
          value={meal}
          onChange={(v) => update((d) => void (d.instant.meal = v))}
          options={[
            { value: "b", label: "Breakfast" },
            { value: "l", label: "Lunch" },
            { value: "d", label: "Dinner" },
          ]}
        />
        <Segmented<string>
          value={String(maxMin)}
          onChange={(v) => update((d) => void (d.instant.maxMin = Number(v)))}
          options={[
            { value: "20", label: "≤ 20 min" },
            { value: "45", label: "≤ 45 min" },
            { value: "0", label: "Any time" },
          ]}
        />
      </div>

      <PantryBar compact />

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o, i) => {
          const picked = pickId === o.recipe.id;
          return (
            <article key={o.recipe.id} className={`flex flex-col rounded-2xl border p-4 ${picked ? "border-saffron bg-saffron-soft/40" : "border-line bg-surface"}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-semibold leading-snug">{o.recipe.name}</h3>
                {i === 0 && <Tag tone="saffron">Best match</Tag>}
              </div>
              <p className="mt-1 text-[13px] text-muted">
                {o.recipe.countries.join(" × ")} · {o.recipe.totalMin} min
              </p>
              <p className="mt-3 text-sm">
                {o.have.length ? (
                  <>
                    <span className="font-semibold text-leaf">You have {o.have.length}</span> of {o.have.length + o.missing.length} main ingredients.
                  </>
                ) : (
                  state.pantry.length ? "Doesn't use what you already have." : "Add what's in your kitchen above to rank by it."
                )}
              </p>
              {o.missing.length > 0 && (
                <p className="mt-1 text-[13px] text-muted">
                  Need: {o.missing.slice(0, 5).join(", ")}
                  {o.missing.length > 5 && ` +${o.missing.length - 5} more`} · about {money(o.missingCost)}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => ui.openMeal({ kind: "recipe", recipeId: o.recipe.id })}>
                  See recipe
                </Button>
                {o.missing.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => {
                      update((d) => void (d.instant.pickId = o.recipe.id));
                      ui.setTab("groceries");
                    }}
                  >
                    Shop for this
                  </Button>
                )}
              </div>
            </article>
          );
        })}
        {!options.length && <p className="text-sm text-muted">Nothing fits that time limit for your household. Try “Any time”.</p>}
      </div>
    </div>
  );
}
