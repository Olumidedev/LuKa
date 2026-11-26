"use client";

import { useState } from "react";
import { useAIEnabled } from "@/lib/ai/client";
import { ALL_COUNTRIES } from "@/lib/data/countries";
import { useStore } from "@/lib/state/store";
import { FeedbackSheet } from "./FeedbackSheet";
import { LogoMark, Wordmark } from "./brand";
import { Button } from "./ui";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const BUILD = process.env.NEXT_PUBLIC_BUILD ?? "";

export function AboutView() {
  const { ctx } = useStore();
  const ai = useAIEnabled();
  const [feedback, setFeedback] = useState(false);
  const countries = new Set(ctx.recipes.flatMap((r) => r.countries)).size;

  return (
    <div className="grid max-w-2xl gap-8">
      <header className="grid justify-items-start gap-3">
        <span className="flex items-center gap-3">
          <LogoMark size={56} />
          <Wordmark className="text-4xl" />
        </span>
        <p className="font-display text-xl">Your calm, culturally fluent sous-chef.</p>
        <p className="text-sm text-muted">
          Version {VERSION}
          {BUILD && ` · build ${BUILD}`}
        </p>
      </header>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">What LUKA does</h2>
        <p className="text-muted">
          LUKA plans breakfasts, lunches and dinners from the kitchens your family loves, buys each fresh ingredient once and uses it across several meals, and walks whoever is cooking through every step. It never scolds anyone for skipping a meal or ordering takeout.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fact value={ctx.recipes.length} label="recipes in your kitchen" />
        <Fact value={countries} label="countries cooked from" />
        <Fact value={ALL_COUNTRIES.length} label="countries to choose from" />
      </section>
      <p className="-mt-4 text-sm text-muted">
        {ai ? "New recipes are written by Claude when a cuisine needs more variety, then shared with every household that cooks from it." : "New AI-written recipes switch on when the server has a Claude key."}
      </p>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">How LUKA keeps meals safe</h2>
        <ul className="grid list-disc gap-1 pl-5 text-muted">
          <li>Allergies and food rules are checked by fixed rules, not AI, for every recipe, including ones Claude writes.</li>
          <li>Cooking steps show Health Canada minimum safe temperatures.</li>
          <li>Life-stage details stay private and only nudge nutrients.</li>
          <li>Each household&apos;s data is visible only to its members.</li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Built with</h2>
        <p className="text-muted">Next.js, React, Tailwind CSS, Supabase, Claude by Anthropic, and the Fraunces and Plus Jakarta Sans typefaces.</p>
      </section>

      <Button className="justify-self-start" onClick={() => setFeedback(true)}>
        Report a problem or share an idea
      </Button>
      <FeedbackSheet open={feedback} onClose={() => setFeedback(false)} />
    </div>
  );
}

function Fact({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="font-display text-3xl font-semibold tnum">{value.toLocaleString()}</p>
      <p className="text-[13px] text-muted">{label}</p>
    </div>
  );
}
