"use client";

import { useMemo, useState } from "react";
import { ALL_COUNTRIES } from "@/lib/data/countries";
import { aiGenerateRecipes, aiParseRecipe, useAIEnabled, type AIRecipes } from "@/lib/ai/client";
import { normalizeRecipe, parseIngredientLine } from "@/lib/ai/normalize";
import { track } from "@/lib/analytics";
import { useConfig } from "@/lib/cloud/config";
import { cuisineMatch } from "@/lib/engine/cuisine";
import { gateRecipe } from "@/lib/engine/gate";
import { MEAL_LABEL } from "@/lib/engine/planner";
import { useStore } from "@/lib/state/store";
import type { MealType } from "@/lib/types";
import { useUI } from "./uiState";
import { Button, Chip, Label, Segmented, Sheet, Tag, cx, inputCls, useToast } from "./ui";

export function RecipesTab() {
  const { state, ctx, update } = useStore();
  const ui = useUI();
  const config = useConfig();
  const ai = useAIEnabled() && config.features.ai_recipes;
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(true);
  const [meal, setMeal] = useState<MealType | "">("");
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return ctx.recipes
      .filter((r) => !meal || r.meals.includes(meal))
      .filter((r) => !query || r.name.toLowerCase().includes(query) || r.countries.some((c) => c.toLowerCase().includes(query)))
      .filter((r) => !mine || !state.cuisines.length || r.source.type !== "library" || cuisineMatch(r, state.cuisines).score > 0)
      .sort((a, b) => Number(b.source.type !== "library") - Number(a.source.type !== "library") || a.name.localeCompare(b.name));
  }, [ctx.recipes, q, meal, mine, state.cuisines]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Recipes</h1>
          <p className="text-sm text-muted">The library, your family recipes and AI-written dishes. All of them go through your household&apos;s allergen and diet rules.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add your recipe
          </Button>
          <Button onClick={() => setGenerating(true)}>Generate by country</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input id="recipe-search" className={cx(inputCls, "max-w-xs")} placeholder="Search dishes or countries" value={q} onChange={(e) => setQ(e.target.value)} />
        <Segmented<string>
          value={meal}
          onChange={(v) => setMeal(v as MealType | "")}
          options={[
            { value: "", label: "All" },
            { value: "b", label: "Breakfast" },
            { value: "l", label: "Lunch" },
            { value: "d", label: "Dinner" },
          ]}
        />
        {state.cuisines.length > 0 && (
          <Chip active={mine} onClick={() => setMine(!mine)}>
            Your cuisines only
          </Chip>
        )}
      </div>

      <ul className="divide-y divide-line rounded-3xl border border-line bg-surface">
        {list.map((r) => {
          const gate = ctx.gates.get(r.id)!;
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => ui.openMeal({ kind: "recipe", recipeId: r.id })}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[17px] font-semibold">{r.name}</span>
                  {r.source.type === "user" && <Tag tone="saffron">Yours</Tag>}
                  {r.source.type === "ai" && <Tag tone="saffron">AI</Tag>}
                  {!gate.ok && <Tag tone="danger">Not for your household</Tag>}
                </span>
                <span className="block text-[13px] text-muted">
                  {r.countries.join(" × ")} · {r.meals.map((m) => MEAL_LABEL[m]).join(", ")} · {r.totalMin} min
                  {!gate.ok && ` · ${gate.reasons[0]}`}
                </span>
              </button>
              {r.source.type !== "library" && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    update((d) => {
                      d.customRecipes = d.customRecipes.filter((x) => x.id !== r.id);
                    })
                  }
                >
                  Delete
                </Button>
              )}
            </li>
          );
        })}
        {!list.length && <li className="px-5 py-6 text-sm text-muted">No recipes match. Clear the filters or add your own.</li>}
      </ul>

      <AddRecipeSheet open={adding} onClose={() => setAdding(false)} ai={ai} />
      <GenerateSheet open={generating} onClose={() => setGenerating(false)} ai={ai} />
    </div>
  );
}

function useSaveRecipes() {
  const { update, ctx, state } = useStore();
  const toast = useToast();
  return (res: AIRecipes) => {
    update((d) => {
      Object.assign(d.customIngredients, res.ingredients);
      d.customRecipes.push(...res.recipes);
    });
    // Same deterministic gate as the library, applied to the new recipes.
    const ings = { ...ctx.ings, ...res.ingredients };
    track("recipe_added", { source: res.recipes[0]?.source.type ?? "user", count: res.recipes.length });
    const blocked = res.recipes.map((r) => gateRecipe(r, state.members, ings)).filter((g) => !g.ok);
    toast({
      text: `Added ${res.recipes.length} recipe${res.recipes.length === 1 ? "" : "s"}.${
        blocked.length ? ` ${blocked.length === res.recipes.length && blocked.length === 1 ? "It" : `${blocked.length}`} won't be planned: ${blocked[0].reasons[0].toLowerCase()}.` : ""
      }`,
    });
  };
}

function AddRecipeSheet({ open, onClose, ai }: { open: boolean; onClose: () => void; ai: boolean }) {
  const save = useSaveRecipes();
  const [mode, setMode] = useState<"paste" | "manual">(ai ? "paste" : "manual");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const [credit, setCredit] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [meals, setMeals] = useState<MealType[]>(["d"]);
  const [mins, setMins] = useState("45");
  const [ings, setIngs] = useState("");
  const [steps, setSteps] = useState("");
  const effMode = ai ? mode : "manual";

  const reset = () => {
    setText("");
    setName("");
    setIngs("");
    setSteps("");
    setErr("");
    onClose();
  };

  const submit = async () => {
    setErr("");
    if (effMode === "paste") {
      setBusy(true);
      try {
        save(await aiParseRecipe(text, credit || undefined, url || undefined));
        reset();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "That didn't work.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const lines = ings.split("\n").map(parseIngredientLine).filter((x) => x !== null);
    const n = normalizeRecipe(
      {
        name,
        countries: country ? [country] : [],
        meals,
        activeMin: Math.min(Number(mins) || 30, 60),
        totalMin: Number(mins) || 45,
        spice: 1,
        ingredients: lines,
        steps: steps.split("\n").map((s) => s.trim()).filter(Boolean),
        credit,
        url,
      },
      { type: "user" },
    );
    if (!n) {
      setErr("Add a name, at least one ingredient line and one step.");
      return;
    }
    save({ recipes: [n.recipe], ingredients: n.ingredients });
    reset();
  };

  return (
    <Sheet
      open={open}
      onClose={reset}
      title="Add your recipe"
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-danger">{err}</span>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Reading recipe…" : "Save recipe"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        {ai ? (
          <Segmented<"paste" | "manual">
            value={mode}
            onChange={setMode}
            options={[
              { value: "paste", label: "Paste from anywhere" },
              { value: "manual", label: "Type it in" },
            ]}
          />
        ) : (
          <p className="rounded-2xl bg-sunk p-3 text-[13px] text-muted">Pasting a blog post or video transcript needs the AI service (add a Gemini key on the server). Typing a recipe in works now.</p>
        )}
        {effMode === "paste" ? (
          <>
            <div>
              <Label htmlFor="paste">Recipe text</Label>
              <textarea id="paste" rows={10} className={cx(inputCls, "h-auto py-2")} placeholder="Paste a food blog recipe, video description or a family recipe…" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div>
                <Label htmlFor="r-name">Dish name</Label>
                <input id="r-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mum's Banga Soup" />
              </div>
              <div>
                <Label htmlFor="r-country">Country</Label>
                <input id="r-country" list="all-countries" className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Nigeria" />
                <datalist id="all-countries">
                  {ALL_COUNTRIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label>Good for</Label>
                <div className="flex gap-1.5">
                  {(["b", "l", "d"] as MealType[]).map((m) => (
                    <Chip key={m} active={meals.includes(m)} onClick={() => setMeals(meals.includes(m) ? meals.filter((x) => x !== m) : [...meals, m])}>
                      {MEAL_LABEL[m]}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="w-32">
                <Label htmlFor="r-mins">Total minutes</Label>
                <input id="r-mins" inputMode="numeric" className={inputCls} value={mins} onChange={(e) => setMins(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="r-ings">Ingredients for 4, one per line</Label>
              <textarea id="r-ings" rows={6} className={cx(inputCls, "h-auto py-2")} placeholder={"500 g goat meat\n2 cups rice\n3 tomatoes\n1 tsp curry powder"} value={ings} onChange={(e) => setIngs(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="r-steps">Steps, one per line</Label>
              <textarea id="r-steps" rows={5} className={cx(inputCls, "h-auto py-2")} value={steps} onChange={(e) => setSteps(e.target.value)} />
            </div>
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="r-credit">Credit (who it&apos;s from)</Label>
            <input id="r-credit" className={inputCls} value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Grandma Bisi, or a cookbook page" />
          </div>
          <div>
            <Label htmlFor="r-url">Link (optional)</Label>
            <input id="r-url" className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function GenerateSheet({ open, onClose, ai }: { open: boolean; onClose: () => void; ai: boolean }) {
  const { state } = useStore();
  const save = useSaveRecipes();
  const picks = state.cuisines.filter((p) => p.type === "country").map((p) => p.value);
  const [country, setCountry] = useState(picks[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    setErr("");
    if (!ALL_COUNTRIES.includes(country)) {
      setErr("Choose a country from the list.");
      return;
    }
    setBusy(true);
    try {
      save(await aiGenerateRecipes(country, state.members));
      track("ai_recipes_generated", { country });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Generate recipes by country"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-danger">{err}</span>
          <Button variant="primary" onClick={run} disabled={!ai || busy}>
            {busy ? "Writing recipes…" : "Generate 4 recipes"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        {!ai && <p className="rounded-2xl bg-sunk p-3 text-[13px] text-muted">This needs the AI service. Add a Gemini API key on the server (see .env.example) and reload.</p>}
        <p className="text-sm text-muted">
          Luka asks the model for everyday home dishes from one country, sending only your household&apos;s allergens and food rules, never names or health details. Every recipe it writes is checked again here before it can be planned.
        </p>
        <div>
          <Label htmlFor="gen-country">Country</Label>
          <input id="gen-country" list="gen-countries" className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Burkina Faso" />
          <datalist id="gen-countries">
            {ALL_COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        {picks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {picks.map((p) => (
              <Chip key={p} active={country === p} onClick={() => setCountry(p)}>
                {p}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
