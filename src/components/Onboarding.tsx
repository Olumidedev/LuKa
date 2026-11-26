"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { useConfig } from "@/lib/cloud/config";
import { newMember } from "@/lib/state/defaults";
import { regenerate } from "@/lib/state/actions";
import { useStore } from "@/lib/state/store";
import type { PlanType } from "@/lib/types";
import { Logo } from "./brand";
import { CuisinePicker } from "./CuisinePicker";
import { MemberEditor } from "./MemberEditor";
import { Button, cx } from "./ui";

export const PLAN_OPTIONS: { value: PlanType; label: string; blurb: string }[] = [
  { value: "instant", label: "Instant meal", blurb: "One dish for right now, built around what's in your kitchen." },
  { value: "5day", label: "5 weekdays", blurb: "Monday–Friday breakfast, lunch and dinner with one shop." },
  { value: "14day", label: "14 days", blurb: "Two full weeks, two shops, leftovers planned in." },
];

const STEPS = ["Who's eating", "Your cuisines", "Your plan"];

/** Stage 1 onboarding (BRD §3.3): three inputs, then an immediate plan. */
export function Onboarding() {
  const { state, update } = useStore();
  const config = useConfig();
  const planOptions = PLAN_OPTIONS.filter((o) => (o.value !== "instant" || config.features.instant) && (o.value !== "14day" || config.features.fourteen_day));
  const [step, setStep] = useState(0);
  const [members, setMembers] = useState(state.members.length ? state.members : [newMember()]);
  const [cuisines, setCuisines] = useState(state.cuisines);
  const [planType, setPlanType] = useState<PlanType>(state.planType);

  const named = members.every((m) => m.name.trim());
  const canNext = step === 0 ? named : step === 1 ? cuisines.length > 0 : true;

  const finish = () =>
    update((d) => {
      d.members = members;
      d.cuisines = cuisines;
      d.onboarded = true;
      d.settings.takeoutPerPerson = config.defaults.takeout_per_person;
      track("onboarding_done", { members: members.length, cuisines: cuisines.length, type: planType });
      regenerate(d, { type: planType, reshuffle: true });
    });

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-[max(16px,env(safe-area-inset-left))] py-8 sm:py-14">
      <header className="mb-8">
        <Logo size={34} wordClass="text-2xl" />
        <h1 className="mt-3 font-display text-[28px] font-semibold leading-tight sm:text-4xl">
          {step === 0 && "Who are you cooking for?"}
          {step === 1 && "Which kitchens do you cook from?"}
          {step === 2 && "How far ahead should we plan?"}
        </h1>
        <p className="mt-2 max-w-prose text-muted">
          {step === 0 && "Add everyone who eats at home. Allergies are never included in any meal; diets get their own portion swaps."}
          {step === 1 && "Choose countries, whole regions or a blend. LUKA mixes them across the week."}
          {step === 2 && "You can switch any time. Your shopping list follows the plan you pick."}
        </p>
        <ol className="mt-6 flex gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <div className={cx("h-1 rounded-full", i <= step ? "bg-saffron" : "bg-line")} />
              <span className={cx("mt-1.5 block text-[12px] font-semibold", i === step ? "text-fg" : "text-muted")}>{s}</span>
            </li>
          ))}
        </ol>
      </header>

      <main className="flex-1">
        {step === 0 && (
          <div className="grid gap-3">
            {members.map((m, i) => (
              <MemberEditor
                key={m.id}
                member={m}
                autoFocus={i === members.length - 1 && !m.name}
                onChange={(nm) => setMembers(members.map((x) => (x.id === m.id ? nm : x)))}
                onRemove={members.length > 1 ? () => setMembers(members.filter((x) => x.id !== m.id)) : undefined}
              />
            ))}
            <Button variant="ghost" className="justify-self-start" onClick={() => setMembers([...members, newMember()])}>
              + Add someone
            </Button>
          </div>
        )}
        {step === 1 && <CuisinePicker value={cuisines} onChange={setCuisines} extraRecipes={state.customRecipes} />}
        {step === 2 && (
          <div className="grid gap-3" role="radiogroup">
            {planOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={planType === o.value}
                onClick={() => setPlanType(o.value)}
                className={cx(
                  "rounded-2xl border p-4 text-left transition",
                  planType === o.value ? "border-saffron bg-saffron-soft" : "border-line bg-surface hover:border-muted",
                )}
              >
                <span className="font-display text-lg font-semibold">{o.label}</span>
                <span className="mt-1 block text-sm text-muted">{o.blurb}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      <footer className="sticky bottom-0 mt-8 flex items-center justify-between gap-3 bg-bg py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {step === 0 && !named && <span className="text-[13px] text-muted">Give everyone a name</span>}
          {step < 2 ? (
            <Button variant="primary" size="lg" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={finish}>
              Build my plan
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
