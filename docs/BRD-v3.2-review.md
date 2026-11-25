# Luka BRD v3.1 → v3.2: review and build decisions

This records what the MVP on this branch builds, what it deliberately defers, and why. It follows the product-owner feedback on v3.1 and the PM / architect / finance critique.

## Product-owner feedback and how it is addressed

| Feedback | What the build does |
| --- | --- |
| Plan options should be **Instant meal, 5 weekdays, 14 days** | One switch on the Plan tab. *Instant* ranks dishes for right now by what's already in the kitchen and a time limit. *5 weekdays* plans Mon–Fri × 3 meals with one shop. *14 days* plans 42 slots with two weekly shops. |
| Cultural heritage must be **by country, with broader groups** | 170 countries in 18 culinary regions. Pick any mix of countries, whole regions, or one-tap blends (Afro-Caribbean, Nigerian × Jamaican, Mediterranean, Pan-African…). "Nigeria + Caribbean" is two taps. Countries with no recipes yet fall back to same-region dishes, say so on screen, and can get AI-written recipes once a key is set. |
| **Grocery list missing / app feels disconnected** | Plan → list → cook is now one loop. The plan's summary band opens the shopping list; every list row says which meals it's for; every meal opens its recipe, which opens Cook Mode. Four tabs only: Plan, Groceries, Recipes, Household. |
| **Too much on screen** | Spices and oils are folded into "Check your cupboard"; covered items are hidden; nutrition is badges by default; store routing and loyalty live behind a "Stores" button. |
| **Where do family members and their restrictions go?** | Step 1 of onboarding, and the Household tab: name, age group, allergies (CFIA priority list), diet, faith/household rules, spice tolerance, life stage, dislikes, and whether they share the cooking. |

## Architecture changes adopted from the critique

1. **Neuro-symbolic planning (FR-3.2).** The model never does arithmetic. A seeded, deterministic solver (`src/lib/engine/planner.ts`) chooses and sequences recipes, chains perishables within each weekly shop, turns batch dinners into next-day lunches, and computes pack-rounded quantities. Test: fresh-food utilization stays above 75% across seeds (typically 83–97% in testing).
2. **FR-7: Deterministic culinary safety gate.** `src/lib/engine/gate.ts` excludes any recipe containing a household allergen or a faith-rule violation with no model involved. Diets get per-member portion swaps only when the swap is itself safe. Health Canada minimum internal temperatures are attached to every protein. AI-written and pasted recipes pass the same gate, and ingredient names are re-scanned for allergens so a model can't drop one (`src/lib/ai/normalize.ts`).
3. **Free tier shows the hook.** Cuisine mixing isn't gated (the critique's "2 roots on free" point). Paywalls aren't implemented in the MVP.
4. **No passive wake word on the web.** Cook Mode is an active "kitchen dock": screen wake lock plus foreground voice commands while it's open ("next", "repeat", "set a 12 minute timer for the plantains", "how much ginger?").
5. **Push-to-Look instead of streaming video.** Vision is limited to a single fridge photo. It's re-encoded on the device (EXIF/GPS stripped), checked by magic bytes, processed in memory and never stored.
6. **Cold start.** Every ingredient has a Toronto baseline price and pack size, so the list prices itself on day 1.
7. **Cook vs. order, reframed as fridge rescue.** The recipe sheet compares home cost with a transparent takeout estimate (per-person spend + a flat, stated 28%). It also points out when the dish uses fresh food already bought this week.
8. **Day-1 security baseline, not enterprise plumbing.** Shipped: strict security headers, deny-by-default Postgres row-level security with membership-based tenant isolation (`supabase/migrations`, tested in `supabase/tests`), a server-only AI gateway, per-IP rate limits on AI endpoints, untrusted-text delimiters against prompt injection, only constraints (not names or health data) sent to the model, and handoff links that keep the recipe in the URL fragment so it never reaches a server. Deferred to post-PMF: CMEK envelope encryption, multi-region active-active, enterprise WAF, ClamAV pipeline.
9. **No social-video scraping.** Users paste text or type recipes (with credit and link). URL fetching, oEmbed and schema.org JSON-LD ingestion come later, behind an egress-filtered fetcher.

## Built vs. deferred

**In this MVP:** onboarding (3 steps), household profiles, country/region/blend picker, the three plan types, pins, swaps, reshuffle, skip-a-day ("Reshuffle & Rescue"), prep anchors, leftover chaining, cook rotation, a pack-aware grocery list with weekly shops, pantry subtraction, multi-store aisle routing with loyalty names, list copy, recipe library (60 dishes, 38 countries, fusion), bring-your-own recipes, Cook Mode (timers, read-aloud, voice, wake lock, safety checks), partner handoff links, nutrition badges / numbers / off, and life-stage nutrient nudges.

**Wired but needs keys:** AI recipe generation by country, paste-anything recipe structuring, fridge photo scan (`GEMINI_API_KEY`).

**Added since:** Supabase accounts (email/password, email link, optional Google), cloud sync and household invites, chosen over Firebase because it is open source and self-hostable. **Next:** admin area and analytics, receipt OCR price book, offline service worker, groups tier, and Stripe/app-store billing.

## Corrections to v3.1 numbers

- §7.2: $6.55 / $8.85 is a **74.0% gross margin on gross revenue** (90.2% of net revenue), not 92.0%. Align §7.2 and §7.3.
- §7.3 Year-1 R&D of $52k is under-budgeted for a two-person build. Either model founder sweat equity explicitly or budget $140–180k.
- Phase-1 gate of ≥65% D14 retention is above top-decile consumer benchmarks (25–35%). A realistic behavioural gate is ≥40% week-2 activation and 2+ completed recipes per household per week.
- The $0.42/user AI COGS only holds with Push-to-Look (no continuous video) and capped audio minutes.
