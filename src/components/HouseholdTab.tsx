"use client";

import { useState } from "react";
import { pickLabel } from "@/lib/data/countries";
import { regenerate } from "@/lib/state/actions";
import { defaultState, newMember } from "@/lib/state/defaults";
import { useStore } from "@/lib/state/store";
import type { Member } from "@/lib/types";
import { MemberEditor, needsSummary } from "./MemberEditor";
import { useUI } from "./uiState";
import { Button, Label, Segmented, inputCls, useToast } from "./ui";

const SAFETY_FIELDS: (keyof Member)[] = ["allergies", "diet", "rules", "age", "stage", "dislikes", "cooks", "spice"];

export function HouseholdTab() {
  const { state, update, replace } = useStore();
  const ui = useUI();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

  const setMember = (id: string, m: Member) => {
    const prev = state.members.find((x) => x.id === id);
    const relevant = !prev || SAFETY_FIELDS.some((f) => JSON.stringify(prev[f]) !== JSON.stringify(m[f]));
    update((d) => {
      d.members = d.members.map((x) => (x.id === id ? m : x));
      // Any change to allergies or rules re-runs the planner so no unsafe meal survives.
      if (relevant && d.plan) regenerate(d);
    });
  };

  const counts = new Map<string, number>();
  for (const m of state.members) for (const s of needsSummary(m).filter((x) => !["Pregnant", "Trying to conceive", "Breastfeeding", "Training hard", "65+"].includes(x))) counts.set(s, (counts.get(s) ?? 0) + 1);

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">Household</h1>
            <p className="text-sm text-muted">Everyone Luka cooks for. Life stage stays on this device and only nudges nutrients.</p>
          </div>
          <Button
            onClick={() =>
              update((d) => {
                d.members.push(newMember({ name: `Member ${d.members.length + 1}` }));
                if (d.plan) regenerate(d);
              })
            }
          >
            + Add someone
          </Button>
        </div>
        {counts.size > 0 && (
          <p className="rounded-2xl bg-leaf-soft px-4 py-3 text-sm text-leaf">
            <b className="font-semibold">Cooking around: </b>
            {[...counts].map(([k, n]) => `${n} ${k.toLowerCase()}`).join(" · ")}
          </p>
        )}
        <div className="grid gap-3">
          {state.members.map((m) => (
            <MemberEditor
              key={m.id}
              member={m}
              onChange={(nm) => setMember(m.id, nm)}
              onRemove={
                state.members.length > 1
                  ? () =>
                      update((d) => {
                        d.members = d.members.filter((x) => x.id !== m.id);
                        if (d.plan) regenerate(d);
                      })
                  : undefined
              }
            />
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl font-semibold">Cuisines</h2>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">{state.cuisines.length ? state.cuisines.map(pickLabel).join(" · ") : "Any cuisine"}</p>
          <Button size="sm" onClick={ui.openCuisines}>
            Change
          </Button>
        </div>
      </section>

      <section className="grid gap-5">
        <h2 className="font-display text-2xl font-semibold">Preferences</h2>
        <div>
          <Label>Nutrition on meals</Label>
          <Segmented
            value={state.settings.nutrition}
            onChange={(v) => update((d) => void (d.settings.nutrition = v))}
            options={[
              { value: "badges", label: "Badges only" },
              { value: "numbers", label: "Show numbers" },
              { value: "off", label: "Hide" },
            ]}
          />
          <p className="mt-1.5 text-[13px] text-muted">Badges flag iron, folate, calcium, omega-3, fibre and protein without counting calories.</p>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--saffron)]"
            checked={state.settings.leftovers}
            onChange={(e) =>
              update((d) => {
                d.settings.leftovers = e.target.checked;
                if (d.plan) regenerate(d);
              })
            }
          />
          <span>
            <b className="font-semibold">Cook once, eat twice.</b> Stews and rice dishes cook a double batch so the next day&apos;s lunch is already made.
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--saffron)]"
            checked={state.settings.rotation}
            onChange={(e) =>
              update((d) => {
                d.settings.rotation = e.target.checked;
                if (d.plan) regenerate(d);
              })
            }
          />
          <span>
            <b className="font-semibold">Share the cooking.</b> Rotate meals fairly between everyone marked as sharing the cooking.
          </span>
        </label>
        <div className="max-w-xs">
          <Label htmlFor="takeout">Typical takeout spend per person ($)</Label>
          <input
            id="takeout"
            inputMode="decimal"
            className={inputCls}
            value={state.settings.takeoutPerPerson}
            onChange={(e) => update((d) => void (d.settings.takeoutPerPerson = Math.max(0, Number(e.target.value) || 0)))}
          />
        </div>
      </section>

      <section className="grid gap-2 border-t border-line pt-6">
        <p className="text-sm text-muted">Your household is saved on this device. Account sync and shared household access arrive with sign-in.</p>
        {confirmReset ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Delete your household, plan and recipes from this device?</span>
            <Button
              variant="danger"
              onClick={() => {
                replace(defaultState());
                toast({ text: "Everything was deleted from this device." });
              }}
            >
              Delete everything
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="danger" className="justify-self-start" onClick={() => setConfirmReset(true)}>
            Start over
          </Button>
        )}
      </section>
    </div>
  );
}
