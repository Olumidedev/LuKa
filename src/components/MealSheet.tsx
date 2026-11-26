"use client";

import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { useConfig } from "@/lib/cloud/config";
import { buildCookCard, stepText } from "@/lib/engine/cookcard";
import { dayLabel } from "@/lib/engine/dates";
import { encodeHandoff } from "@/lib/engine/handoff";
import { BADGE_LABEL, badges, costPerServing, perServing } from "@/lib/engine/nutrition";
import { MEAL_LABEL, alternatives, assignCooks } from "@/lib/engine/planner";
import { isPerishable } from "@/lib/engine/shopping";
import { useStore } from "@/lib/state/store";
import type { Recipe } from "@/lib/types";
import { useUI, type MealRef } from "./uiState";
import { Button, Sheet, Tag, money, useToast } from "./ui";

const TAKEOUT_MARKUP = 1.28; // delivery fee + service + tax + tip, flat and stated

export function MealSheet({ target, onClose }: { target: MealRef | null; onClose: () => void }) {
  const { state, ctx, update } = useStore();
  const ui = useUI();
  const toast = useToast();
  const [view, setView] = useState<"detail" | "swap" | "handoff">("detail");
  const config = useConfig();

  const slot = target?.kind === "slot" ? state.plan?.days[target.day]?.meals[target.meal] : undefined;
  const recipeId = target?.kind === "recipe" ? target.recipeId : slot?.recipeId;
  const recipe = recipeId ? ctx.byId.get(recipeId) : undefined;
  const leftover = slot?.leftoverOf != null;
  const feeds = target?.kind === "slot" && target.meal === "d" && state.plan?.days[target.day + 1]?.meals.l.leftoverOf === target.day;
  const portions = ctx.portions * (feeds ? 2 : 1);
  const card = useMemo(() => (recipe ? buildCookCard(ctx, recipe, portions, !!feeds) : null), [ctx, recipe, portions, feeds]);

  const close = () => {
    setView("detail");
    onClose();
  };
  if (!target || !recipe || !card) return null;

  const gate = ctx.gates.get(recipe.id)!;
  const n = perServing(recipe, ctx.ings);
  const b = badges(n);
  const cookCost = costPerServing(recipe, ctx.ings) * ctx.portions;
  const takeout = state.members.length * state.settings.takeoutPerPerson * TAKEOUT_MARKUP;
  const fresh = recipe.ingredients.map((ri) => ctx.ings[ri.key]).filter((i) => i && isPerishable(i)).map((i) => i.name.toLowerCase());
  const cooks = state.members.filter((m) => m.cooks);
  const when = target.kind === "slot" && state.plan ? `${dayLabel(state.plan.days[target.day].date).dow} ${MEAL_LABEL[target.meal].toLowerCase()}` : undefined;

  const setSlot = (fn: (s: NonNullable<typeof slot>) => void) =>
    update((d) => {
      if (target.kind !== "slot" || !d.plan) return;
      fn(d.plan.days[target.day].meals[target.meal]);
    });

  const swapTo = (r: Recipe) => {
    update((d) => {
      if (target.kind !== "slot" || !d.plan) return;
      const day = target.day;
      const s = d.plan.days[day].meals[target.meal];
      s.recipeId = r.id;
      delete s.leftoverOf;
      s.pinned = true;
      // A dinner that used to cover tomorrow's lunch: keep leftovers only if the new dish batches well.
      const next = d.plan.days[day + 1];
      if (target.meal === "d" && next?.meals.l.leftoverOf === day && !(r.batch && d.settings.leftovers)) {
        const alt = alternatives(ctx, d.plan, day + 1, "l", 1)[0];
        next.meals.l = { recipeId: alt?.recipe.id ?? null };
      }
      assignCooks({ ...ctx, state: d }, d.plan);
    });
    setView("detail");
    track("meal_swapped", { meal: target.kind === "slot" ? target.meal : "" });
    toast({ text: `Swapped in ${r.name} and pinned it. Your shopping list is updated.` });
  };

  const handoffUrl = (cook?: string) =>
    `${window.location.origin}/handoff#${encodeHandoff({ card, cook, from: state.members[0]?.name, when })}`;

  const sendHandoff = async (memberId: string) => {
    const m = state.members.find((x) => x.id === memberId);
    setSlot((s) => {
      s.cookId = memberId;
      s.pinned = true;
    });
    const url = handoffUrl(m?.name);
    track("handoff_sent", { share: !!navigator.share });
    const text = `${m?.name ? `${m.name}, you're` : "You're"} cooking ${recipe.name}${when ? ` (${when})` : ""}. Everything you need is here:`;
    try {
      if (navigator.share) await navigator.share({ title: recipe.name, text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast({ text: "Handoff link copied. Paste it into a message." });
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  const footer =
    view === "detail" ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => ui.openCook(card)}>
          {leftover ? "Reheat steps" : "Start cooking"}
        </Button>
        {target.kind === "slot" && (
          <>
            <Button onClick={() => setView("swap")}>Swap</Button>
            {!leftover && config.features.handoff && <Button onClick={() => setView("handoff")}>Hand off</Button>}
            <Button
              variant="ghost"
              onClick={() =>
                setSlot((s) => {
                  s.pinned = !s.pinned;
                })
              }
            >
              {slot?.pinned ? "Unpin" : "Pin"}
            </Button>
          </>
        )}
      </div>
    ) : (
      <Button variant="ghost" onClick={() => setView("detail")}>
        Back to recipe
      </Button>
    );

  return (
    <Sheet open onClose={close} title={view === "swap" ? `Swap ${when ?? ""}` : view === "handoff" ? "Who's cooking?" : recipe.name} footer={footer} wide>
      {view === "detail" && (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {when && <Tag tone="saffron">{when}</Tag>}
            <span>{recipe.countries.join(" × ")}</span>
            <span>·</span>
            <span>
              {recipe.activeMin} min hands-on, {recipe.totalMin} total
            </span>
            {recipe.spice > 0 && (
              <>
                <span>·</span>
                <span aria-label={`Spice ${recipe.spice} of 3`}>{`Spice ${"●".repeat(recipe.spice)}${"○".repeat(3 - recipe.spice)}`}</span>
              </>
            )}
          </div>

          {leftover && (
            <p className="rounded-2xl bg-sunk p-4 text-sm">
              Leftovers from {state.plan && dayLabel(state.plan.days[slot!.leftoverOf!].date).dow}&apos;s dinner. Reheat until steaming hot (74 °C / 165 °F) and stir halfway.
            </p>
          )}
          {feeds && <p className="rounded-2xl bg-leaf-soft p-4 text-sm text-leaf">Cooking double tonight: tomorrow&apos;s lunch is these leftovers.</p>}

          {gate.notes.length > 0 && (
            <ul className="grid gap-1.5 rounded-2xl bg-saffron-soft p-4 text-sm text-saffron-ink">
              {gate.notes.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}

          {!leftover && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Cook at home</p>
                <p className="mt-1 font-display text-2xl font-semibold tnum">{money(cookCost)}</p>
                <p className="text-[13px] text-muted">
                  for {state.members.length} · {recipe.activeMin} min hands-on
                </p>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Order takeout</p>
                <p className="mt-1 font-display text-2xl font-semibold tnum">~{money(takeout)}</p>
                <p className="text-[13px] text-muted">
                  ${state.settings.takeoutPerPerson}/person + 28% fees, tax &amp; tip (estimate)
                </p>
              </div>
              {fresh.length > 0 && target.kind === "slot" && (
                <p className="text-[13px] text-muted sm:col-span-2">
                  This uses fresh {fresh.slice(0, 3).join(", ")} from this week&apos;s shop. Cooking it saves about {money(Math.max(0, takeout - cookCost))} and keeps them out of the bin.
                </p>
              )}
            </div>
          )}

          {state.settings.nutrition !== "off" && (
            <div className="flex flex-wrap items-center gap-2">
              {b.map((x) => (
                <Tag key={x} tone="leaf">
                  {BADGE_LABEL[x]}
                </Tag>
              ))}
              {state.settings.nutrition === "numbers" && (
                <span className="text-[13px] text-muted tnum">
                  Per adult serving ≈ {Math.round(n.kcal)} kcal · {Math.round(n.protein)} g protein · {Math.round(n.fiber)} g fibre · {n.iron.toFixed(1)} mg iron · {Math.round(n.folate)} µg folate
                </span>
              )}
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-[1fr_1.4fr]">
            <section>
              <h3 className="mb-2 font-semibold">Ingredients{feeds ? " (double batch)" : ""}</h3>
              <ul className="grid gap-1.5 text-[15px]">
                {card.ingredients.map((i) => (
                  <li key={i} className="border-b border-line pb-1.5">
                    {i}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="mb-2 font-semibold">Method</h3>
              <ol className="grid list-decimal gap-2 pl-5 text-[15px] marker:text-muted">
                {card.steps.map((s, i) => (
                  <li key={i}>{stepText(s)}</li>
                ))}
              </ol>
              {card.safety.length > 0 && <p className="mt-3 text-[13px] text-leaf">{card.safety.join(" · ")}</p>}
              {recipe.source.type !== "library" && (
                <p className="mt-3 text-[12px] text-muted">
                  {recipe.source.type === "ai" ? "Written with AI and checked by Luka's allergen and diet rules." : `Your recipe${recipe.source.credit ? ` · ${recipe.source.credit}` : ""}`}
                  {recipe.source.url && (
                    <>
                      {" · "}
                      <a className="underline" href={recipe.source.url} target="_blank" rel="noopener noreferrer">
                        source
                      </a>
                    </>
                  )}
                </p>
              )}
            </section>
          </div>
        </div>
      )}

      {view === "swap" && target.kind === "slot" && state.plan && (
        <ul className="grid gap-2">
          {alternatives(ctx, state.plan, target.day, target.meal).map((a) => (
            <li key={a.recipe.id}>
              <button type="button" onClick={() => swapTo(a.recipe)} className="w-full rounded-2xl border border-line p-4 text-left hover:border-saffron">
                <span className="font-display text-lg font-semibold">{a.recipe.name}</span>
                <span className="block text-[13px] text-muted">
                  {a.recipe.countries.join(" × ")} · {a.recipe.activeMin} min hands-on
                </span>
                {a.shared.length > 0 && <span className="mt-1 block text-[13px] text-leaf">Uses {a.shared.slice(0, 3).join(", ").toLowerCase()} you&apos;re already buying</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {view === "handoff" && (
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            Send a link with exact quantities, steps, timers and doneness cues. It opens on any phone, no account needed, and the recipe travels inside the link itself.
          </p>
          <div className="grid gap-2">
            {(cooks.length ? cooks : state.members).map((m) => (
              <Button key={m.id} className="justify-between" onClick={() => sendHandoff(m.id)}>
                <span>{m.name}</span>
                <span className="text-muted">{slot?.cookId === m.id ? "Assigned" : "Send"}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
