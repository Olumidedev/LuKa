"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/cloud/supabase";
import { Tag } from "../ui";

interface Similar {
  recipe_id: string;
  title: string;
  cuisine_tags: string[];
  local_dish_names: Record<string, string> | null;
  archetype_label: string | null;
  score: number;
  shared_ingredients: number;
  reasons: { same_archetype?: boolean; cross_cultural?: boolean };
}

interface Palette {
  plate_id: string;
  plate_title: string;
  plate_summary: string | null;
  cuisine_tags: string[];
  recipe_ids: string[];
  recipe_titles: string[];
  shared_archetypes: number;
  shared_pantry: string[];
}

function useRpc<T>(fn: string, args: Record<string, unknown> | null): T[] | null {
  const [rows, setRows] = useState<T[] | null>(null);
  const key = JSON.stringify(args);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !args) return;
    let live = true;
    sb.rpc(fn, args).then(({ data, error }) => live && setRows(error ? [] : ((data ?? []) as T[])));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, key]);
  return rows;
}

const localName = (n: Record<string, string> | null) => (n ? Object.values(n)[0] : undefined);

/** Dishes cooked the same way in other kitchens ("Dodo ↔ fried ripe plantain ↔ pazham pori"). */
export function SimilarDishesStrip({ recipeId, onOpen }: { recipeId: string; onOpen: (id: string) => void }) {
  const rows = useRpc<Similar>("find_similar_dishes", { p_recipe_id: recipeId, p_prefer_cross_cultural: true, p_limit: 6 });
  if (!rows?.length) return null;
  return (
    <section aria-labelledby="similar-h" className="grid gap-2">
      <h3 id="similar-h" className="text-sm font-semibold">
        Cousins in other kitchens
      </h3>
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {rows.map((r) => (
          <li key={r.recipe_id} className="w-52 shrink-0 snap-start">
            <button type="button" onClick={() => onOpen(r.recipe_id)} className="grid h-full w-full gap-1 rounded-2xl border border-line bg-surface p-3 text-left hover:border-muted">
              <span className="font-semibold leading-snug">{r.title}</span>
              {localName(r.local_dish_names) && <span className="text-[13px] italic text-muted">{localName(r.local_dish_names)}</span>}
              <span className="text-[13px] text-muted">{r.cuisine_tags.join(" · ")}</span>
              {r.shared_ingredients > 0 && (
                <span className="text-[13px] font-semibold text-[#065F46] dark:text-leaf">
                  {r.shared_ingredients} ingredient{r.shared_ingredients > 1 ? "s" : ""} in common
                </span>
              )}
              {r.reasons?.same_archetype && r.archetype_label && <Tag>{r.archetype_label}</Tag>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A whole plate from another cuisine that reuses what this household already buys. */
export function PaletteExpansionCard({ householdId, recipeIds, onOpen }: { householdId: string | null; recipeIds: string[]; onOpen: (id: string) => void }) {
  const rows = useRpc<Palette>("suggest_palette_expansions", recipeIds.length ? { p_household_id: householdId, p_current_recipe_ids: recipeIds, p_limit: 2 } : null);
  const p = rows?.[0];
  if (!p) return null;
  return (
    <section aria-labelledby="palette-h" className="grid gap-3 rounded-3xl border border-line bg-sunk/50 p-4">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Try next · {p.cuisine_tags.join(" · ")}</p>
        <h3 id="palette-h" className="font-display text-xl font-semibold">
          {p.plate_title}
        </h3>
        {p.plate_summary && <p className="text-sm text-muted">{p.plate_summary}</p>}
      </div>
      {p.shared_pantry.length > 0 && (
        <p className="text-sm font-semibold text-[#065F46] dark:text-leaf">
          Uses {p.shared_pantry.length} thing{p.shared_pantry.length > 1 ? "s" : ""} you already buy: {p.shared_pantry.slice(0, 4).join(", ").toLowerCase()}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {p.recipe_ids.map((id, i) => (
          <button key={id} type="button" onClick={() => onOpen(id)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-muted">
            {p.recipe_titles[i]}
          </button>
        ))}
      </div>
    </section>
  );
}
