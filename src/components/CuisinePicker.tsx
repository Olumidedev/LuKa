"use client";

import { useMemo, useState } from "react";
import { BLENDS, REGIONS, pickLabel, samePick } from "@/lib/data/countries";
import { LIBRARY } from "@/lib/data/recipes";
import type { CuisinePick, Recipe } from "@/lib/types";
import { Chip, cx, inputCls } from "./ui";

export const MAX_PICKS = 6;

/** Country-level picker with regions as broader groups and one-tap blends. */
export function CuisinePicker({
  value,
  onChange,
  extraRecipes = [],
}: {
  value: CuisinePick[];
  onChange: (v: CuisinePick[]) => void;
  extraRecipes?: Recipe[];
}) {
  const [q, setQ] = useState("");
  const [openRegion, setOpenRegion] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of [...LIBRARY, ...extraRecipes]) for (const k of r.countries) c.set(k, (c.get(k) ?? 0) + 1);
    return c;
  }, [extraRecipes]);

  const has = (p: CuisinePick) => value.some((v) => samePick(v, p));
  const toggle = (p: CuisinePick) => {
    if (has(p)) onChange(value.filter((v) => !samePick(v, p)));
    else if (value.length < MAX_PICKS) onChange([...value, p]);
  };

  const query = q.trim().toLowerCase();
  const regions = REGIONS.map((r) => ({
    ...r,
    shown: query ? r.countries.filter((c) => c.toLowerCase().includes(query)) : r.countries,
    regionHit: query && r.name.toLowerCase().includes(query),
  })).filter((r) => !query || r.shown.length || r.regionHit);

  return (
    <div className="grid gap-4">
      <div className="min-h-10 rounded-2xl border border-dashed border-line p-2">
        {value.length ? (
          <div className="flex flex-wrap gap-1.5">
            {value.map((p) => (
              <Chip key={p.type + p.value} active onClick={() => toggle(p)} title="Remove">
                {pickLabel(p)}
                <span aria-hidden className="text-[15px] leading-none">×</span>
              </Chip>
            ))}
          </div>
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted">Pick up to {MAX_PICKS} countries or regions. Mix them freely, e.g. Nigeria + Caribbean.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Popular blends</p>
        <div className="flex flex-wrap gap-1.5">
          {BLENDS.map((b) => (
            <Chip
              key={b.name}
              active={b.picks.every(has)}
              onClick={() => {
                const add = b.picks.filter((p) => !has(p));
                onChange([...value, ...add].slice(0, MAX_PICKS));
              }}
            >
              {b.name}
            </Chip>
          ))}
        </div>
      </div>

      <input
        id="cuisine-search"
        className={inputCls}
        placeholder="Search 170 countries, e.g. Ghana, Trinidad, Iran…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="divide-y divide-line rounded-2xl border border-line">
        {regions.map((r) => {
          const open = !!query || openRegion === r.name;
          const picked = value.filter((v) => (v.type === "region" && v.value === r.name) || (v.type === "country" && r.countries.includes(v.value))).length;
          const regionPick: CuisinePick = { type: "region", value: r.name };
          return (
            <div key={r.name}>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpenRegion(open && !query ? null : r.name)} aria-expanded={open}>
                  <svg className={cx("shrink-0 text-muted transition", open && "rotate-90")} width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M5 3l4 4-4 4" />
                  </svg>
                  <span className="truncate font-semibold">{r.name}</span>
                  <span className="text-[12px] text-muted">{r.countries.length} countries</span>
                  {picked > 0 && <span className="rounded-full bg-saffron-soft px-2 text-[11px] font-semibold text-saffron-ink">{picked} picked</span>}
                </button>
                <Chip active={has(regionPick)} onClick={() => toggle(regionPick)} className="!py-1 text-[12px]">
                  Whole region
                </Chip>
              </div>
              {open && (
                <div className="flex flex-wrap gap-1.5 px-3 pb-3 pl-8">
                  {r.shown.map((c) => {
                    const n = counts.get(c) ?? 0;
                    return (
                      <Chip key={c} active={has({ type: "country", value: c })} onClick={() => toggle({ type: "country", value: c })} title={n ? `${n} recipes in the library` : "Uses regional recipes until you add or generate some"}>
                        {c}
                        {n > 0 && <span className="text-[11px] text-muted">{n}</span>}
                      </Chip>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {!regions.length && <p className="px-3 py-4 text-sm text-muted">No country matches “{q}”.</p>}
      </div>
      {value.length >= MAX_PICKS && <p className="text-[13px] text-muted">That&apos;s the maximum of {MAX_PICKS}. Remove one to add another.</p>}
    </div>
  );
}
