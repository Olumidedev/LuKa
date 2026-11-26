"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { getSupabase } from "@/lib/cloud/supabase";
import { Button, Chip, cx } from "../ui";

const TAGS = [
  { key: "repeat_staple", label: "Repeat staple" },
  { key: "household_hit", label: "Household hit" },
  { key: "easy_weeknight", label: "Easy weeknight" },
  { key: "tweak_spice", label: "Tweak spice next time" },
] as const;

/**
 * Shown when a cook taps Finished. One tap rates the dish; optional tags say why.
 * Each row in `cook_feedback` updates the recipe's rating and nudges the
 * household's taste weights, so the planner learns what this family loves.
 */
export function CookModeFeedbackCard({ householdId, recipeId, title, onDone }: { householdId: string; recipeId: string; title: string; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const sb = getSupabase();
    if (!sb || !rating) return onDone();
    setSaving(true);
    const { error: e } = await sb.from("cook_feedback").insert({ household_id: householdId, recipe_id: recipeId, rating, quick_tags: tags });
    setSaving(false);
    if (e) {
      setError("Couldn't save that. You can skip for now.");
      return;
    }
    track("cook_feedback", { rating, tags: tags.length });
    onDone();
  };

  return (
    <section aria-labelledby="fb-title" className="mx-auto grid w-full max-w-md gap-5 rounded-3xl border border-line bg-surface p-6">
      <div>
        <h2 id="fb-title" className="font-display text-2xl font-semibold">
          How was {title}?
        </h2>
        <p className="text-sm text-muted">One tap helps LUKA plan more of what your household enjoys.</p>
      </div>
      <div role="radiogroup" aria-label="Rating" className="flex justify-between gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} out of 5`}
            onClick={() => setRating(n)}
            className={cx("grid h-12 w-12 place-items-center rounded-full border text-2xl transition", n <= rating ? "border-saffron bg-saffron-soft text-saffron" : "border-line text-muted hover:border-muted")}
          >
            ★
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {TAGS.map((t) => (
          <Chip key={t.key} active={tags.includes(t.key)} onClick={() => setTags((c) => (c.includes(t.key) ? c.filter((x) => x !== t.key) : [...c, t.key]))}>
            {t.label}
          </Chip>
        ))}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Skip
        </Button>
        <Button variant="leaf" onClick={save} disabled={!rating || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}
