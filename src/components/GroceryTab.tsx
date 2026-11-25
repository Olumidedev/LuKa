"use client";

import { useMemo, useState } from "react";
import { AISLES } from "@/lib/data/ingredients";
import { dayLabel } from "@/lib/engine/dates";
import { MEAL_LABEL } from "@/lib/engine/planner";
import { formatPacks, formatQty, recipeNeeds } from "@/lib/engine/quantities";
import { computeShopping, planEntries, weeklyTrip, type ShopItem, type ShopTrip } from "@/lib/engine/shopping";
import { newId } from "@/lib/state/defaults";
import { useStore } from "@/lib/state/store";
import type { Aisle } from "@/lib/types";
import { PantryBar } from "./PantryBar";
import { useUI } from "./uiState";
import { Button, Label, Segmented, Sheet, cx, inputCls, money, useToast } from "./ui";

export function GroceryTab() {
  const { state, ctx, update } = useStore();
  const ui = useUI();
  const toast = useToast();
  const [trip, setTrip] = useState(0);
  const [storesOpen, setStoresOpen] = useState(false);
  const [showCupboard, setShowCupboard] = useState(false);
  const [showCovered, setShowCovered] = useState(false);

  const instant = state.planType === "instant";
  const instantRecipe = instant && state.instant.pickId ? ctx.byId.get(state.instant.pickId) : undefined;

  const trips: ShopTrip[] = useMemo(() => {
    if (instant) {
      if (!instantRecipe) return [];
      const gate = ctx.gates.get(instantRecipe.id);
      if (!gate?.ok) return [];
      return computeShopping(ctx, [{ day: 0, meal: state.instant.meal, recipeId: instantRecipe.id, needs: recipeNeeds(instantRecipe, state.members, gate, ctx.portions) }], () => 0);
    }
    return state.plan ? computeShopping(ctx, planEntries(ctx, state.plan), weeklyTrip) : [];
  }, [ctx, instant, instantRecipe, state.plan, state.instant.meal, state.members]);

  if (!trips.length) {
    return (
      <Empty
        title={instant ? "Pick an instant meal first" : "No plan yet"}
        body={instant ? "Choose a dish on the Plan tab and tap “Shop for this”; the missing ingredients land here." : "Build a plan and your list appears here automatically."}
        action={<Button variant="primary" onClick={() => ui.setTab("plan")}>Go to plan</Button>}
      />
    );
  }

  const t = trips[Math.min(trip, trips.length - 1)];
  const cartKey = (k: string) => `${instant ? "i" : t.index}:${k}`;
  const shopping = t.items.filter((i) => !AISLES.find((a) => a.key === i.ing.aisle)?.cupboard);
  const cupboard = t.items.filter((i) => AISLES.find((a) => a.key === i.ing.aisle)?.cupboard);
  const inCart = shopping.filter((i) => state.inCart[cartKey(i.key)]).length;
  const multiStore = state.stores.length > 1;
  const storeOf = (a: Aisle) => state.aisleStore[a] ?? state.stores[0]?.id;

  const dayName = (d: number) => (state.plan && !instant ? dayLabel(state.plan.days[d].date).dow : "");
  const firstDay = t.days[0] != null && state.plan && !instant ? dayLabel(state.plan.days[t.days[0]].date) : null;

  const markHave = (key: string) =>
    update((d) => {
      if (!d.pantry.some((p) => p.key === key)) d.pantry.push({ key, qty: null });
    });

  const copyList = async () => {
    const lines = [`Luka shopping list${firstDay ? ` (${firstDay.dow} ${firstDay.date})` : ""}`];
    for (const s of multiStore ? state.stores : [state.stores[0]]) {
      if (multiStore) lines.push("", s.name.toUpperCase());
      for (const a of AISLES) {
        const items = t.items.filter((i) => i.ing.aisle === a.key && (!multiStore || storeOf(a.key) === s.id));
        if (!items.length) continue;
        lines.push("", a.label);
        for (const i of items) lines.push(`- ${i.ing.name}: ${formatPacks(i.packs, i.ing)}`);
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast({ text: "List copied. Paste it anywhere." });
    } catch {
      toast({ text: "Couldn't copy. Your browser blocked the clipboard." });
    }
  };

  const groups: { store?: string; aisle: (typeof AISLES)[number]; items: ShopItem[] }[] = [];
  for (const s of multiStore ? state.stores : [undefined]) {
    for (const a of AISLES.filter((x) => !x.cupboard)) {
      const items = shopping.filter((i) => i.ing.aisle === a.key && (!s || storeOf(a.key) === s.id));
      if (items.length) groups.push({ store: s?.name, aisle: a, items });
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
            {instant ? `For ${instantRecipe?.name}` : trips.length > 1 ? `Shop ${t.index + 1} of ${trips.length}` : "This week's shop"}
            {firstDay && ` · ${firstDay.dow} ${firstDay.date}`}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tnum">
            {shopping.length} items · {money(t.total)}
          </h1>
          <p className="text-sm text-muted">
            {inCart} in your cart
            {t.freshUsed != null && ` · ${Math.round(t.freshUsed * 100)}% of the fresh food gets eaten`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {trips.length > 1 && (
            <Segmented<string>
              value={String(t.index)}
              onChange={(v) => setTrip(Number(v))}
              options={trips.map((x) => ({ value: String(x.index), label: `Shop ${x.index + 1}` }))}
            />
          )}
          <Button size="sm" onClick={() => setStoresOpen(true)}>
            {multiStore ? `${state.stores.length} stores` : "Stores"}
          </Button>
          <Button size="sm" onClick={copyList}>
            Copy list
          </Button>
        </div>
      </div>

      <PantryBar />

      <div className="grid gap-4">
        {groups.map((g, gi) => (
          <section key={`${g.store}-${g.aisle.key}`} className="rounded-3xl border border-line bg-surface">
            <h2 className="flex items-baseline justify-between border-b border-line px-4 py-2.5 sm:px-5">
              <span className="font-semibold">{g.aisle.label}</span>
              {g.store && (gi === 0 || groups[gi - 1].store !== g.store) && <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-saffron-ink">{g.store}</span>}
            </h2>
            <ul className="divide-y divide-line">
              {g.items.map((i) => (
                <Row key={i.key} item={i} checked={!!state.inCart[cartKey(i.key)]} onCheck={(v) => update((d) => void (d.inCart[cartKey(i.key)] = v))} onHave={() => markHave(i.key)} dayName={dayName} showUses={!instant} recipeName={(id) => ctx.byId.get(id)?.name ?? ""} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {cupboard.length > 0 && (
        <section className="rounded-3xl border border-dashed border-line">
          <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left sm:px-5" onClick={() => setShowCupboard(!showCupboard)} aria-expanded={showCupboard}>
            <span>
              <span className="font-semibold">Check your cupboard</span>
              <span className="ml-2 text-sm text-muted">{cupboard.length} spices &amp; oils you may already have</span>
            </span>
            <span className="text-sm font-semibold text-saffron-ink">{showCupboard ? "Hide" : "Show"}</span>
          </button>
          {showCupboard && (
            <ul className="divide-y divide-line border-t border-line">
              {cupboard.map((i) => (
                <Row key={i.key} item={i} checked={!!state.inCart[cartKey(i.key)]} onCheck={(v) => update((d) => void (d.inCart[cartKey(i.key)] = v))} onHave={() => markHave(i.key)} dayName={dayName} showUses={false} recipeName={() => ""} />
              ))}
            </ul>
          )}
        </section>
      )}

      {t.covered.length > 0 && (
        <section>
          <button type="button" className="text-sm font-semibold text-muted hover:text-fg" onClick={() => setShowCovered(!showCovered)} aria-expanded={showCovered}>
            {showCovered ? "Hide" : "Show"} {t.covered.length} items covered by your kitchen
          </button>
          {showCovered && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {t.covered.map((i) => (
                <li key={i.key} className="rounded-full bg-sunk px-3 py-1 text-[13px] text-muted line-through decoration-muted/50">
                  {i.ing.name}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="text-[12px] text-muted">Prices are Toronto-area estimates until you add your own; they update as your price book grows.</p>
      <StoresSheet open={storesOpen} onClose={() => setStoresOpen(false)} />
    </div>
  );
}

function Row({
  item,
  checked,
  onCheck,
  onHave,
  dayName,
  showUses,
  recipeName,
}: {
  item: ShopItem;
  checked: boolean;
  onCheck: (v: boolean) => void;
  onHave: () => void;
  dayName: (d: number) => string;
  showUses: boolean;
  recipeName: (id: string) => string;
}) {
  const id = `cart-${item.key}`;
  const uses = [...new Map(item.uses.map((u) => [`${u.day}-${u.meal}`, u])).values()];
  const leftoverQty = item.packs * item.ing.pack - (item.need - item.fromHome);
  return (
    <li className={cx("flex items-start gap-3 px-4 py-3 sm:px-5", checked && "opacity-50")}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--leaf)]" />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={cx("flex flex-wrap items-baseline gap-x-2", checked && "line-through")}>
          <span className="font-semibold">{item.ing.name}</span>
          <span className="text-sm text-muted">{formatPacks(item.packs, item.ing)}</span>
        </label>
        {showUses && uses.length > 0 && (
          <p className="mt-0.5 text-[12px] text-muted" title={uses.map((u) => recipeName(u.recipeId)).join(", ")}>
            For {uses.slice(0, 3).map((u) => `${dayName(u.day)} ${MEAL_LABEL[u.meal].toLowerCase()}`).join(" · ")}
            {uses.length > 3 && ` +${uses.length - 3} more meals`}
          </p>
        )}
        {item.utilization != null && item.utilization < 0.85 && leftoverQty > 0 && (
          <p className="mt-0.5 text-[12px] text-saffron-ink">About {formatQty(leftoverQty, item.ing)} left over. Freeze it or add a dish that uses it.</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tnum">{money(item.cost)}</span>
        <button type="button" onClick={onHave} className="text-[12px] font-medium text-muted hover:text-fg">
          Have it
        </button>
      </div>
    </li>
  );
}

function StoresSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, update } = useStore();
  const [name, setName] = useState("");
  const [loyalty, setLoyalty] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="Your stores">
      <div className="grid gap-5">
        <p className="text-sm text-muted">Add the grocers, butchers and specialty shops you actually use, then send each aisle to the store you buy it from.</p>
        <ul className="grid gap-2">
          {state.stores.map((s, i) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-2xl border border-line px-4 py-2.5">
              <span>
                <span className="font-semibold">{s.name}</span>
                {s.loyalty && <span className="ml-2 text-[13px] text-muted">{s.loyalty}</span>}
              </span>
              {i > 0 && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    update((d) => {
                      d.stores = d.stores.filter((x) => x.id !== s.id);
                      for (const k of Object.keys(d.aisleStore) as Aisle[]) if (d.aisleStore[k] === s.id) delete d.aisleStore[k];
                    })
                  }
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            update((d) => void d.stores.push({ id: newId(), name: name.trim().slice(0, 60), loyalty: loyalty.trim().slice(0, 40) || undefined }));
            setName("");
            setLoyalty("");
          }}
        >
          <input id="store-name" className={inputCls} placeholder="Store, e.g. Afro-Caribbean market" value={name} onChange={(e) => setName(e.target.value)} />
          <input id="store-loyalty" className={inputCls} placeholder="Loyalty program (optional)" value={loyalty} onChange={(e) => setLoyalty(e.target.value)} />
          <Button type="submit" variant="primary">
            Add
          </Button>
        </form>
        {state.stores.length > 1 && (
          <div>
            <Label>Where you buy each aisle</Label>
            <div className="grid gap-2">
              {AISLES.map((a) => (
                <div key={a.key} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{a.label}</span>
                  <select
                    aria-label={`Store for ${a.label}`}
                    className={cx(inputCls, "!w-auto")}
                    value={state.aisleStore[a.key] ?? state.stores[0].id}
                    onChange={(e) => update((d) => void (d.aisleStore[a.key] = e.target.value))}
                  >
                    {state.stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid justify-items-start gap-3 rounded-3xl border border-dashed border-line p-8">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <p className="max-w-prose text-muted">{body}</p>
      {action}
    </div>
  );
}
