"use client";

import { useRef, useState } from "react";
import { useStore } from "@/lib/state/store";
import { aiScanFridge, useAIEnabled } from "@/lib/ai/client";
import { Button, cx, inputCls, useToast } from "./ui";

/** What's already at home: typed, ticked off the list, or read from a fridge photo. */
export function PantryBar({ compact }: { compact?: boolean }) {
  const { state, ctx, update } = useStore();
  const ai = useAIEnabled();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const options = Object.values(ctx.ings)
    .filter((i) => !state.pantry.some((p) => p.key === i.key))
    .sort((a, b) => a.name.localeCompare(b.name));

  const add = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (!v) return;
    const hit = options.find((i) => i.name.toLowerCase() === v) ?? options.find((i) => i.name.toLowerCase().includes(v) || i.key === v);
    if (!hit) {
      toast({ text: `“${raw}” isn't in the ingredient list yet. Try a simpler name, like “spinach”.` });
      return;
    }
    update((d) => {
      d.pantry.push({ key: hit.key, qty: null });
    });
    setQ("");
  };

  const scan = async (f: File) => {
    setBusy(true);
    try {
      const found = await aiScanFridge(f);
      update((d) => {
        for (const it of found) {
          const existing = d.pantry.find((p) => p.key === it.key);
          if (existing) existing.useWithinDays = it.useWithinDays ?? existing.useWithinDays;
          else d.pantry.push({ key: it.key, qty: it.qty, useWithinDays: it.useWithinDays });
        }
      });
      toast({ text: found.length ? `Found ${found.length} items. Luka will use the ones that spoil soonest first.` : "Couldn't recognise anything in that photo." });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "The scan didn't work. Try another photo." });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  return (
    <div className={cx("rounded-2xl border border-line bg-surface", compact ? "p-3" : "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Already in your kitchen</p>
        {ai && (
          <>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
            <Button size="sm" onClick={() => file.current?.click()} disabled={busy}>
              {busy ? "Reading photo…" : "Scan fridge photo"}
            </Button>
          </>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {state.pantry.map((p) => {
          const ing = ctx.ings[p.key];
          if (!ing) return null;
          const soon = p.useWithinDays != null && p.useWithinDays <= 3;
          return (
            <span key={p.key} className={cx("inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-[13px]", soon ? "bg-saffron-soft text-saffron-ink" : "bg-sunk")}>
              {ing.name}
              {soon && <span className="text-[11px] font-semibold">· use soon</span>}
              <button
                type="button"
                aria-label={`Remove ${ing.name}`}
                className="rounded-full px-1.5 text-muted hover:text-fg"
                onClick={() =>
                  update((d) => {
                    d.pantry = d.pantry.filter((x) => x.key !== p.key);
                  })
                }
              >
                ×
              </button>
            </span>
          );
        })}
        <form
          className="flex min-w-48 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            add(q);
          }}
        >
          <input id="pantry-add" list="pantry-options" className={cx(inputCls, "h-8 rounded-full text-[13px]")} placeholder="Add an item, e.g. rice" value={q} onChange={(e) => setQ(e.target.value)} />
          <datalist id="pantry-options">
            {options.map((o) => (
              <option key={o.key} value={o.name} />
            ))}
          </datalist>
        </form>
      </div>
    </div>
  );
}
