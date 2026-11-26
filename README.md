# LUKA

Lu's Kitchen Assistant: a culturally fluent sous-chef. Tell it who's eating and which kitchens you cook from (Nigeria and the Caribbean, Lebanon and Morocco, anywhere). LUKA plans an instant meal, a working week or two weeks of breakfasts, lunches and dinners, then writes the shopping list and walks whoever is cooking through each dish.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. No keys are needed: the household and plan are saved in the browser, and the planner, allergen checks and recipe library all run locally.

```bash
npm test          # engine, safety-gate and import tests
npm run build     # production build
```

### Optional AI features

Set `ANTHROPIC_API_KEY` (server-side) to turn on Claude:

- **A growing menu:** when a cuisine someone picks has few recipes, Claude writes more. They're stored in a shared Supabase catalog (`supabase/migrations/20261126030000_recipe_catalog.sql`) so every household that cooks from that country benefits. Admins can hide or delete them, or generate more, under Admin → Recipes.
- **Generate by country:** six home recipes for any of the 171 countries.
- **Paste a recipe:** turns blog text or a family recipe into a LUKA recipe, with credit.
- **Scan fridge photo:** marks what's already at home and what needs using soon.

Nothing about a household is sent to Claude. Everything it writes is re-checked by the same fixed-rule allergen and diet check as the built-in library before it can be planned. AI features need a signed-in user, and each person gets `AI_DAILY_LIMIT` new batches a day.

### Accounts and sync

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to turn on sign-in (email and password, email links, optional Google), cloud sync and household invites. Setup steps, including the database migration, are in `docs/SUPABASE.md`.

## How it's built

| Area | Where |
| --- | --- |
| Ingredient catalogue (pack sizes, baseline prices, allergens, nutrition) | `src/lib/data/ingredients.ts` |
| 171 countries in 18 regions, plus blends | `src/lib/data/countries.ts` |
| Recipe library (60 dishes, scalable steps with timers) | `src/lib/data/recipes.ts` |
| Allergen, faith-rule and diet gate (no AI) | `src/lib/engine/gate.ts` |
| Deterministic planner, swaps, skip-a-day, prep tips, instant meal | `src/lib/engine/planner.ts` |
| Pack-aware shopping list and fresh-food utilization | `src/lib/engine/shopping.ts` |
| AI gateway, prompts and untrusted-output normalizer | `src/lib/ai/` and `src/app/api/ai/` |
| UI (Next.js App Router, Tailwind v4) | `src/components/`, `src/app/` |
| Database schema and row-level security (Supabase / Postgres) | `supabase/migrations/`, tested by `supabase/tests/` |
| Sign-in, sync and invites | `src/lib/cloud/`, `src/app/login`, `src/app/join` |

`docs/BRD-v3.2-review.md` explains the product decisions behind this MVP and what's deferred.
