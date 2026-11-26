-- LUKA food knowledge base: canonical ingredients with source-backed facts,
-- cross-cultural dish archetypes and meal plates, taste profiles learned from
-- cook feedback, a reviewed intake queue, demand tracking, and the RPCs the
-- planner, palette engine and sous-chef use.
--
-- Principle: one canonical row per real-world thing; every external fact is a
-- separate, attributed assertion (source_id, source_record_ref, verified_at).
-- This migration is idempotent: safe to run again.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;
grant usage on schema extensions to anon, authenticated;

-- ═════════════════════════════ 1. Provenance ═════════════════════════════
create table if not exists public.data_sources (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  url text,
  license text,
  sync_cadence text check (sync_cadence in ('manual', 'daily', 'weekly', 'monthly', 'quarterly', 'static')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.data_sources (id),
  job text not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_seen integer not null default 0,
  records_upserted integer not null default 0,
  error text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists ingestion_runs_source_idx on public.ingestion_runs (source_id, started_at desc);

-- ═════════════════════════════ 2. Ingredient graph ═════════════════════════════
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  -- Key the app's planner uses (e.g. 'chicken'); stable bridge between app and knowledge base.
  app_key text not null unique check (app_key ~ '^[a-z0-9_]{1,60}$'),
  canonical_name text not null,
  category text not null check (category in ('produce', 'protein', 'dairy', 'bakery', 'grains', 'canned', 'condiments', 'spices', 'oils')),
  kind text check (kind in ('poultry', 'beef', 'pork', 'lamb', 'goat', 'fish', 'shellfish', 'egg', 'dairy', 'honey', 'alcohol')),
  foodon_iri text,
  wikidata_qid text check (wikidata_qid ~ '^Q[0-9]+$'),
  default_pack_unit text not null default 'g' check (default_pack_unit in ('g', 'ml', 'pc')),
  pack_quantity numeric not null default 100 check (pack_quantity > 0),
  default_pack_size_g numeric check (default_pack_size_g > 0),
  grams_per_unit numeric check (grams_per_unit > 0),
  pack_label text,
  countable boolean not null default false,
  shelf_days integer not null default 7,
  chili boolean not null default false,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'source_verified', 'curated')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingredient_names (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  normalized_name text generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored,
  language_code text not null default 'en',
  region_code text,
  is_canonical boolean not null default false,
  is_variant boolean not null default false,
  source_id text references public.data_sources (id),
  created_at timestamptz not null default now(),
  unique (ingredient_id, normalized_name, language_code)
);
create index if not exists ingredient_names_trgm_idx on public.ingredient_names using gin (normalized_name extensions.gin_trgm_ops);
create index if not exists ingredient_names_norm_idx on public.ingredient_names (normalized_name);

create table if not exists public.ingredient_nutrition (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  source_id text not null references public.data_sources (id),
  source_food_id text,
  source_record_ref text,
  -- Per 100 g edible portion.
  energy_kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  sodium_mg numeric,
  micronutrients jsonb not null default '{}'::jsonb, -- iron_mg, folate_ug, calcium_mg, omega3_g, …
  is_primary boolean not null default false,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (ingredient_id, source_id)
);
create unique index if not exists ingredient_nutrition_primary_idx on public.ingredient_nutrition (ingredient_id) where is_primary;

create table if not exists public.ingredient_allergens (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  allergen_key text not null check (allergen_key in ('gluten', 'dairy', 'egg', 'peanut', 'treenut', 'fish', 'shellfish', 'soy', 'sesame', 'mustard')),
  presence text not null check (presence in ('contains', 'may_contain', 'free_from', 'unknown')),
  barcode text,
  pack_size_label text,
  source_id text not null references public.data_sources (id),
  source_record_ref text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists ingredient_allergens_uniq on public.ingredient_allergens (ingredient_id, allergen_key, source_id, coalesce(barcode, ''));

create table if not exists public.ingredient_prices (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  source_id text not null references public.data_sources (id),
  geography_code text not null default 'CA',
  currency_code text not null default 'CAD' check (currency_code ~ '^[A-Z]{3}$'),
  price_amount numeric not null check (price_amount >= 0),
  pack_quantity numeric not null check (pack_quantity > 0),
  pack_unit text not null check (pack_unit in ('g', 'kg', 'ml', 'l', 'pc')),
  normalized_price_per_kg numeric,
  period_start date not null,
  source_series_id text,
  source_record_ref text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists ingredient_prices_uniq on public.ingredient_prices (ingredient_id, source_id, geography_code, period_start, coalesce(source_series_id, ''));
create index if not exists ingredient_prices_latest_idx on public.ingredient_prices (ingredient_id, geography_code, period_start desc);

create table if not exists public.ingredient_seasonality (
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  region_code text not null,
  month smallint not null check (month between 1 and 12),
  availability text not null check (availability in ('peak', 'in_season', 'shoulder', 'off_season')),
  source_id text references public.data_sources (id),
  primary key (ingredient_id, region_code, month)
);

-- Links a canonical ingredient to a record in an external dataset (FDC id, CNF food code, …).
create table if not exists public.ingredient_source_links (
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  source_id text not null references public.data_sources (id),
  external_id text not null,
  matched_name text,
  confidence numeric,
  status text not null default 'auto' check (status in ('auto', 'confirmed', 'rejected')),
  updated_at timestamptz not null default now(),
  primary key (ingredient_id, source_id)
);

create table if not exists public.statcan_product_map (
  product_label text primary key,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  grams_per_product numeric, -- grams in the product's stated quantity; null when priced per kg
  per_unit boolean not null default false, -- priced "unit" (e.g. Avocado, unit)
  notes text
);

-- ═════════════════════════════ 3. Dishes, archetypes, plates ═════════════════════════════
create table if not exists public.dish_archetypes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  canonical_label text not null,
  description text,
  foodon_iri text,
  wikidata_qid text
);

-- Evolve the existing shared catalog table into the knowledge-base recipes table.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'recipes' and column_name = 'name') then
    alter table public.recipes rename column name to title;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'recipes' and column_name = 'countries') then
    alter table public.recipes rename column countries to cuisine_tags;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'recipes' and column_name = 'ingredients') then
    alter table public.recipes rename column ingredients to app_ingredients;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'recipes' and column_name = 'source') then
    alter table public.recipes drop constraint if exists recipes_source_check;
    alter table public.recipes rename column source to origin_type;
    update public.recipes set origin_type = 'claude' where origin_type in ('ai', 'admin');
  end if;
end $$;

alter table public.recipes drop constraint if exists recipes_origin_type_check;
alter table public.recipes alter column origin_type set default 'claude';
alter table public.recipes add constraint recipes_origin_type_check check (origin_type in ('built_in', 'claude', 'user', 'partner'));

alter table public.recipes
  add column if not exists slug text,
  add column if not exists summary text,
  add column if not exists local_dish_names jsonb not null default '[]'::jsonb,
  add column if not exists dish_archetype_id uuid references public.dish_archetypes (id) on delete set null,
  add column if not exists plate_role text,
  add column if not exists flavor_tags text[] not null default '{}',
  add column if not exists texture_tags text[] not null default '{}',
  add column if not exists prep_minutes integer,
  add column if not exists cook_minutes integer,
  add column if not exists servings numeric not null default 4,
  add column if not exists origin_ref text,
  add column if not exists license text,
  add column if not exists attribution text,
  add column if not exists source_url text,
  add column if not exists created_by_household_id uuid references public.households (id) on delete set null,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists embedding extensions.vector(1536),
  add column if not exists avg_rating numeric(3, 2),
  add column if not exists rating_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.recipes set slug = regexp_replace(lower(id), '[^a-z0-9]+', '-', 'g') where slug is null;
alter table public.recipes alter column slug set not null;
create unique index if not exists recipes_slug_idx on public.recipes (slug);
alter table public.recipes drop constraint if exists recipes_plate_role_check;
alter table public.recipes add constraint recipes_plate_role_check check (plate_role is null or plate_role in ('main_one_pot', 'base_starch', 'protein_main', 'vegetable_side', 'sweet_side', 'soup_stew', 'condiment'));
alter table public.recipes drop constraint if exists recipes_verification_status_check;
alter table public.recipes add constraint recipes_verification_status_check check (verification_status in ('unverified', 'source_verified', 'curated'));
create index if not exists recipes_archetype_idx on public.recipes (dish_archetype_id);
create index if not exists recipes_title_trgm_idx on public.recipes using gin (lower(title) extensions.gin_trgm_ops);

create table if not exists public.dish_origins (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null references public.recipes (id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  region_label text,
  wikidata_dish_qid text,
  wikidata_country_qid text,
  foodon_iri text,
  relation_type text not null default 'origin' check (relation_type in ('origin', 'popular_in', 'diaspora_adaptation')),
  unique (recipe_id, country_code, relation_type)
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null references public.recipes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  unit text not null check (unit in ('g', 'ml', 'pc')),
  grams_equivalent numeric,
  preparation_note text,
  is_optional boolean not null default false,
  sort_order integer not null default 0
);
create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);
create index if not exists recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);

create table if not exists public.recipe_steps (
  recipe_id text not null references public.recipes (id) on delete cascade,
  step_number integer not null check (step_number > 0),
  instruction text not null,
  timer_minutes integer,
  primary key (recipe_id, step_number)
);

create table if not exists public.recipe_variants (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null references public.recipes (id) on delete cascade,
  variant_type text not null check (variant_type in ('regional_swap', 'dietary', 'quick_prep', 'spice_level')),
  label text not null,
  description text,
  swaps jsonb not null default '[]'::jsonb
);

create table if not exists public.meal_plates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  cuisine_tags text[] not null default '{}',
  verification_status text not null default 'curated' check (verification_status in ('unverified', 'source_verified', 'curated'))
);

create table if not exists public.meal_plate_items (
  plate_id uuid not null references public.meal_plates (id) on delete cascade,
  recipe_id text not null references public.recipes (id) on delete cascade,
  role_in_plate text not null check (role_in_plate in ('main_one_pot', 'base_starch', 'protein_main', 'vegetable_side', 'sweet_side', 'soup_stew', 'condiment')),
  is_anchor boolean not null default false,
  sort_order integer not null default 0,
  primary key (plate_id, recipe_id)
);

-- ═════════════════════════════ 4. Households, taste, feedback ═════════════════════════════
alter table public.households
  add column if not exists region_code text not null default 'CA',
  add column if not exists dietary_restrictions text[] not null default '{}',
  add column if not exists allergen_exclusions text[] not null default '{}';

create table if not exists public.household_taste_profiles (
  household_id uuid primary key references public.households (id) on delete cascade,
  cuisine_weights jsonb not null default '{}'::jsonb,
  ingredient_weights jsonb not null default '{}'::jsonb,
  preferred_max_minutes integer check (preferred_max_minutes between 5 and 600),
  spice_tolerance text check (spice_tolerance in ('mild', 'medium', 'hot')),
  updated_at timestamptz not null default now()
);

create table if not exists public.cook_feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id text not null references public.recipes (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  rating smallint not null check (rating between 1 and 5),
  quick_tags text[] not null default '{}' check (quick_tags <@ array['repeat_staple', 'household_hit', 'easy_weeknight', 'tweak_spice']),
  notes text check (char_length(notes) <= 1000),
  cooked_at timestamptz not null default now()
);
create index if not exists cook_feedback_recipe_idx on public.cook_feedback (recipe_id);
create index if not exists cook_feedback_household_idx on public.cook_feedback (household_id, cooked_at desc);

-- Feedback updates the recipe's rating and nudges the household's taste weights.
create or replace function public.fn_apply_cook_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delta numeric := (new.rating - 3) * 0.15;
  tag text;
  ing text;
  cw jsonb;
  iw jsonb;
begin
  update public.recipes r
     set avg_rating = s.avg, rating_count = s.n, updated_at = now()
    from (select avg(rating)::numeric(3, 2) as avg, count(*)::int as n from public.cook_feedback where recipe_id = new.recipe_id) s
   where r.id = new.recipe_id;

  insert into public.household_taste_profiles (household_id) values (new.household_id) on conflict do nothing;
  select cuisine_weights, ingredient_weights into cw, iw from public.household_taste_profiles where household_id = new.household_id for update;

  for tag in select unnest(cuisine_tags) from public.recipes where id = new.recipe_id loop
    cw := jsonb_set(cw, array[tag], to_jsonb(least(3.0, greatest(0.2, coalesce((cw ->> tag)::numeric, 1.0) + delta))));
  end loop;
  for ing in
    select i.slug from public.recipe_ingredients ri join public.ingredients i on i.id = ri.ingredient_id
     where ri.recipe_id = new.recipe_id and i.category not in ('spices', 'oils')
  loop
    iw := jsonb_set(iw, array[ing], to_jsonb(least(3.0, greatest(0.2, coalesce((iw ->> ing)::numeric, 1.0) + delta / 3))));
  end loop;

  update public.household_taste_profiles set cuisine_weights = cw, ingredient_weights = iw, updated_at = now() where household_id = new.household_id;
  return new;
end;
$$;
drop trigger if exists trg_apply_cook_feedback on public.cook_feedback;
create trigger trg_apply_cook_feedback after insert on public.cook_feedback for each row execute function public.fn_apply_cook_feedback();

-- Keep households.allergen_exclusions / dietary_restrictions in step with the app's
-- household state, and log cuisine picks for demand tracking.
create table if not exists public.cuisine_selection_events (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  cuisine text not null,
  selection_type text not null default 'country' check (selection_type in ('country', 'region')),
  created_at timestamptz not null default now()
);
create index if not exists cuisine_selection_events_idx on public.cuisine_selection_events (cuisine, created_at desc);

create or replace function public.fn_sync_household_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_picks jsonb := case when tg_op = 'UPDATE' then coalesce(old.state -> 'cuisines', '[]'::jsonb) else '[]'::jsonb end;
  pick jsonb;
begin
  update public.households h
     set allergen_exclusions = coalesce((
           select array_agg(distinct a.v order by a.v)
           from jsonb_array_elements(coalesce(new.state -> 'members', '[]'::jsonb)) as m(v),
                jsonb_array_elements_text(coalesce(m.v -> 'allergies', '[]'::jsonb)) as a(v)), '{}'),
         dietary_restrictions = coalesce((
           select array_agg(distinct x.d order by x.d) from (
             select m.v ->> 'diet' as d from jsonb_array_elements(coalesce(new.state -> 'members', '[]'::jsonb)) as m(v) where coalesce(m.v ->> 'diet', '') <> ''
             union
             select r.v from jsonb_array_elements(coalesce(new.state -> 'members', '[]'::jsonb)) as m(v), jsonb_array_elements_text(coalesce(m.v -> 'rules', '[]'::jsonb)) as r(v)
           ) x), '{}')
   where h.id = new.household_id;

  for pick in select * from jsonb_array_elements(coalesce(new.state -> 'cuisines', '[]'::jsonb)) loop
    if not (old_picks @> jsonb_build_array(pick)) and pick ->> 'value' is not null then
      insert into public.cuisine_selection_events (household_id, cuisine, selection_type)
      values (new.household_id, left(pick ->> 'value', 80), case when pick ->> 'type' = 'region' then 'region' else 'country' end);
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_sync_household_profile on public.household_state;
create trigger trg_sync_household_profile after insert or update of state on public.household_state
  for each row execute function public.fn_sync_household_profile();

-- ═════════════════════════════ 5. Intake queue ═════════════════════════════
create table if not exists public.recipe_submissions (
  id uuid primary key default gen_random_uuid(),
  source_channel text not null,
  origin_type text not null check (origin_type in ('built_in', 'claude', 'user', 'partner')),
  submitted_by_household_id uuid references public.households (id) on delete set null,
  submitted_by_user_id uuid references auth.users (id) on delete set null,
  license_verified boolean not null default false,
  license_notes text,
  raw_payload jsonb not null,
  normalized_recipe jsonb not null,
  automated_checks jsonb not null default '{}'::jsonb,
  status text not null default 'pending_review' check (status in ('pending_review', 'needs_ingredient_mapping', 'approved', 'rejected')),
  reviewer_notes text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  promoted_recipe_id text references public.recipes (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists recipe_submissions_status_idx on public.recipe_submissions (status, created_at desc);
-- reference_import: facts (name, country, ingredient list) from a listing such as TheMealDB, method written fresh by LUKA.
-- public_domain: out-of-copyright cookbooks (Project Gutenberg, Internet Archive, Feeding America), modernised.
alter table public.recipe_submissions drop constraint if exists recipe_submissions_source_channel_check;
alter table public.recipe_submissions add constraint recipe_submissions_source_channel_check
  check (source_channel in ('family_share', 'partner_feed', 'permitted_open_source', 'public_domain', 'reference_import', 'weekly_gap_agent'));

-- ═════════════════════════════ 6. Row-level security ═════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['data_sources', 'ingredients', 'ingredient_names', 'ingredient_nutrition', 'ingredient_allergens', 'ingredient_prices',
    'ingredient_seasonality', 'ingredient_source_links', 'statcan_product_map', 'dish_archetypes', 'dish_origins', 'recipe_ingredients',
    'recipe_steps', 'recipe_variants', 'meal_plates', 'meal_plate_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "signed-in read" on public.%I', t);
    execute format('create policy "signed-in read" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "admins write" on public.%I', t);
    execute format('create policy "admins write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.ingestion_runs enable row level security;
drop policy if exists "admins read runs" on public.ingestion_runs;
create policy "admins read runs" on public.ingestion_runs for select to authenticated using (public.is_admin());
revoke all on public.ingestion_runs from anon, authenticated;
grant select on public.ingestion_runs to authenticated;

alter table public.household_taste_profiles enable row level security;
drop policy if exists "members read taste" on public.household_taste_profiles;
create policy "members read taste" on public.household_taste_profiles for select to authenticated using (public.is_member(household_id));
drop policy if exists "members tune taste" on public.household_taste_profiles;
create policy "members tune taste" on public.household_taste_profiles for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
revoke all on public.household_taste_profiles from anon, authenticated;
grant select on public.household_taste_profiles to authenticated;
grant update (preferred_max_minutes, spice_tolerance) on public.household_taste_profiles to authenticated;

alter table public.cook_feedback enable row level security;
drop policy if exists "members read feedback" on public.cook_feedback;
create policy "members read feedback" on public.cook_feedback for select to authenticated using (public.is_member(household_id));
drop policy if exists "members give feedback" on public.cook_feedback;
create policy "members give feedback" on public.cook_feedback for insert to authenticated
  with check (public.is_member(household_id) and user_id = (select auth.uid()));
revoke all on public.cook_feedback from anon, authenticated;
grant select, insert on public.cook_feedback to authenticated;

alter table public.cuisine_selection_events enable row level security;
revoke all on public.cuisine_selection_events from anon, authenticated;

alter table public.recipe_submissions enable row level security;
drop policy if exists "admins and submitters read" on public.recipe_submissions;
create policy "admins and submitters read" on public.recipe_submissions for select to authenticated
  using (public.is_admin() or (submitted_by_household_id is not null and public.is_member(submitted_by_household_id)));
revoke all on public.recipe_submissions from anon, authenticated;
grant select on public.recipe_submissions to authenticated;

-- Recipes: members of the creating household may see their own unpublished rows too.
drop policy if exists "signed-in read live recipes; admins read all" on public.recipes;
create policy "signed-in read live recipes; admins read all" on public.recipes for select to authenticated using (status = 'live' or public.is_admin());
grant update (status, title, verification_status, summary, plate_role, dish_archetype_id, flavor_tags, texture_tags) on public.recipes to authenticated;

-- ═════════════════════════════ 7. Views & RPCs ═════════════════════════════

-- Ingredient definitions in the shape the app's planner and grocery list use,
-- with the best available price and primary nutrition from source data.
create or replace view public.app_ingredient_defs with (security_invoker = true) as
select
  i.app_key as key,
  jsonb_build_object(
    'key', i.app_key,
    'name', i.canonical_name,
    'unit', i.default_pack_unit,
    'aisle', i.category,
    'pack', i.pack_quantity,
    'packLabel', coalesce(i.pack_label, i.pack_quantity::text || ' ' || i.default_pack_unit),
    'countable', i.countable,
    'price', round(coalesce(
      (select p.normalized_price_per_kg * coalesce(i.default_pack_size_g, i.pack_quantity) / 1000
         from public.ingredient_prices p
        where p.ingredient_id = i.id and p.geography_code = 'CA' and p.source_id <> 'luka_baseline' and p.normalized_price_per_kg is not null
        order by p.period_start desc limit 1),
      (select p.price_amount from public.ingredient_prices p where p.ingredient_id = i.id and p.source_id = 'luka_baseline' order by p.period_start desc limit 1),
      0)::numeric, 2),
    'priceSource', coalesce(
      (select p.source_id || ':' || to_char(p.period_start, 'YYYY-MM') from public.ingredient_prices p
        where p.ingredient_id = i.id and p.geography_code = 'CA' and p.source_id <> 'luka_baseline' and p.normalized_price_per_kg is not null
        order by p.period_start desc limit 1), 'luka_baseline'),
    'shelf', i.shelf_days,
    'allergens', coalesce((select jsonb_agg(distinct a.allergen_key) from public.ingredient_allergens a where a.ingredient_id = i.id and a.presence in ('contains', 'may_contain')), '[]'::jsonb),
    'kind', i.kind,
    'chili', i.chili,
    'verification', i.verification_status,
    'nutrition', (
      select jsonb_build_object(
        'kcal', coalesce(n.energy_kcal, 0) * f.k, 'protein', coalesce(n.protein_g, 0) * f.k, 'fiber', coalesce(n.fiber_g, 0) * f.k,
        'iron', coalesce((n.micronutrients ->> 'iron_mg')::numeric, 0) * f.k, 'folate', coalesce((n.micronutrients ->> 'folate_ug')::numeric, 0) * f.k,
        'calcium', coalesce((n.micronutrients ->> 'calcium_mg')::numeric, 0) * f.k, 'omega3', coalesce((n.micronutrients ->> 'omega3_g')::numeric, 0) * f.k,
        'source', n.source_id)
      from public.ingredient_nutrition n,
           lateral (select case when i.default_pack_unit = 'pc' then coalesce(i.grams_per_unit, 100) / 100.0 else 1.0 end as k) f
      where n.ingredient_id = i.id and n.is_primary
      limit 1)
  ) as def
from public.ingredients i;
grant select on public.app_ingredient_defs to authenticated;

-- Fuzzy ingredient resolution for the intake pipeline and sous-chef.
create or replace function public.resolve_ingredient_names(p_names text[], p_min_score real default 0.45)
returns table (input_name text, ingredient_id uuid, slug text, app_key text, matched_name text, score real)
language sql
stable
set search_path = ''
as $$
  select q.input_name, best.ingredient_id, best.slug, best.app_key, best.name, best.score
  from unnest(p_names) as q(input_name)
  left join lateral (
    select n.ingredient_id, i.slug, i.app_key, n.name,
           case when n.normalized_name = lower(btrim(q.input_name)) then 1.0::real
                else extensions.similarity(n.normalized_name, lower(btrim(q.input_name))) end as score
    from public.ingredient_names n join public.ingredients i on i.id = n.ingredient_id
    where n.normalized_name = lower(btrim(q.input_name))
       or extensions.similarity(n.normalized_name, lower(btrim(q.input_name))) >= p_min_score
    order by 5 desc, i.verification_status = 'curated' desc
    limit 1
  ) best on true;
$$;
grant execute on function public.resolve_ingredient_names(text[], real) to authenticated;

-- A recipe contains one of these allergens (per source-backed ingredient facts)?
create or replace function public.recipe_has_allergen(p_recipe_id text, p_allergens text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.recipe_ingredients ri
    join public.ingredient_allergens a on a.ingredient_id = ri.ingredient_id
    where ri.recipe_id = p_recipe_id and a.allergen_key = any (p_allergens) and a.presence in ('contains', 'may_contain')
  );
$$;

create or replace function public.get_planner_recommendations(p_household_id uuid, p_limit integer default 20)
returns table (recipe_id text, title text, cuisine_tags text[], plate_role text, score numeric, reasons jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  excl text[];
  tp record;
begin
  if not public.is_member(p_household_id) and not public.is_admin() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select h.allergen_exclusions into excl from public.households h where h.id = p_household_id;
  select * into tp from public.household_taste_profiles t where t.household_id = p_household_id;

  return query
  with scored as (
    select r.id, r.title, r.cuisine_tags, r.plate_role,
           case r.verification_status when 'curated' then 1.0 when 'source_verified' then 0.8 else 0 end as trust,
           coalesce((select avg((tp.cuisine_weights ->> c)::numeric) from unnest(r.cuisine_tags) c where tp.cuisine_weights ? c), 1.0) as taste,
           case when r.rating_count > 0 then (r.avg_rating - 3.0) / 2.0 * least(1.0, r.rating_count / 5.0) else 0 end as rating_lift,
           case when tp.preferred_max_minutes is null then 1.0
                when coalesce(r.prep_minutes, 0) + coalesce(r.cook_minutes, 0) <= tp.preferred_max_minutes then 1.0
                else greatest(0.0, 1.0 - ((coalesce(r.prep_minutes, 0) + coalesce(r.cook_minutes, 0)) - tp.preferred_max_minutes) / 60.0) end as time_fit
    from public.recipes r
    where r.status = 'live'
      and r.verification_status in ('source_verified', 'curated')
      and (r.plate_role is null or r.plate_role in ('main_one_pot', 'protein_main', 'soup_stew'))
      and exists (select 1 from public.recipe_ingredients ri where ri.recipe_id = r.id)
      and not public.recipe_has_allergen(r.id, coalesce(excl, '{}'))
  )
  select s.id, s.title, s.cuisine_tags, s.plate_role,
         round((0.35 * s.trust + 0.30 * least(s.taste, 3.0) / 3.0 * 1.0 + 0.20 * (0.5 + s.rating_lift / 2) + 0.15 * s.time_fit)::numeric, 4),
         jsonb_build_object('trust', s.trust, 'taste_weight', round(s.taste, 2), 'rating_lift', round(s.rating_lift, 2), 'time_fit', round(s.time_fit, 2))
  from scored s
  order by 5 desc, s.title
  limit least(greatest(coalesce(p_limit, 20), 1), 200);
end;
$$;

create or replace function public.find_similar_dishes(p_recipe_id text, p_prefer_cross_cultural boolean default true, p_limit integer default 8)
returns table (recipe_id text, title text, cuisine_tags text[], local_dish_names jsonb, archetype_label text, score numeric, shared_ingredients integer, reasons jsonb)
language sql
stable
set search_path = ''
as $$
  with base as (
    select r.id, r.dish_archetype_id, r.embedding, r.cuisine_tags,
           array(select ri.ingredient_id from public.recipe_ingredients ri join public.ingredients i on i.id = ri.ingredient_id
                 where ri.recipe_id = r.id and i.category not in ('spices', 'oils')) as ings
    from public.recipes r where r.id = p_recipe_id
  ),
  cand as (
    select c.id, c.title, c.cuisine_tags, c.local_dish_names, a.canonical_label,
           case when b.dish_archetype_id is not null and c.dish_archetype_id = b.dish_archetype_id then 1.0 else 0.0 end as arch,
           case when b.embedding is not null and c.embedding is not null
                then greatest(0.0, 1.0 - (c.embedding operator(extensions.<=>) b.embedding)) else 0.0 end as vec,
           (select count(distinct ri.ingredient_id) from public.recipe_ingredients ri where ri.recipe_id = c.id and ri.ingredient_id = any (b.ings)) as shared,
           cardinality(b.ings) as base_n,
           case when not (c.cuisine_tags && b.cuisine_tags) then 1.0 else 0.0 end as cross_cultural
    from base b
    join public.recipes c on c.id <> b.id and c.status = 'live'
    left join public.dish_archetypes a on a.id = c.dish_archetype_id
  )
  select id, title, cuisine_tags, local_dish_names, canonical_label,
         round((0.35 * arch + 0.30 * vec + 0.25 * case when base_n > 0 then shared::numeric / base_n else 0 end
                + 0.10 * case when p_prefer_cross_cultural then cross_cultural else 1.0 - cross_cultural end)::numeric, 4) as score,
         shared::int,
         jsonb_build_object('same_archetype', arch = 1.0, 'embedding_similarity', round(vec::numeric, 3), 'cross_cultural', cross_cultural = 1.0)
  from cand
  where arch > 0 or shared > 0 or vec > 0.75
  order by score desc, title
  limit least(greatest(coalesce(p_limit, 8), 1), 50);
$$;

create or replace function public.suggest_palette_expansions(p_household_id uuid, p_current_recipe_ids text[], p_limit integer default 4)
returns table (plate_id uuid, plate_title text, plate_summary text, country_code text, cuisine_tags text[], recipe_ids text[], recipe_titles text[],
               score numeric, shared_archetypes integer, shared_pantry text[], reasons jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  excl text[] := '{}';
begin
  if p_household_id is not null then
    if not public.is_member(p_household_id) and not public.is_admin() then
      raise exception 'not a member' using errcode = '42501';
    end if;
    select coalesce(h.allergen_exclusions, '{}') into excl from public.households h where h.id = p_household_id;
  end if;

  return query
  with cur as (
    select r.id, r.dish_archetype_id, r.plate_role, r.flavor_tags, r.cuisine_tags from public.recipes r where r.id = any (p_current_recipe_ids)
  ),
  cur_tags as (select coalesce(array_agg(distinct t), '{}') as cuisines from cur, unnest(cur.cuisine_tags) t),
  cur_ings as (
    select coalesce(array_agg(distinct ri.ingredient_id), '{}') as ids from public.recipe_ingredients ri
    join public.ingredients i on i.id = ri.ingredient_id
    where ri.recipe_id = any (p_current_recipe_ids) and i.category not in ('spices', 'oils')
  ),
  plates as (
    select p.id, p.title, p.summary, p.country_code, p.cuisine_tags,
           array_agg(mi.recipe_id order by mi.is_anchor desc, mi.sort_order) as rids,
           array_agg(r.title order by mi.is_anchor desc, mi.sort_order) as titles,
           count(distinct r.dish_archetype_id) filter (where r.dish_archetype_id in (select dish_archetype_id from cur where dish_archetype_id is not null)) as arch_hits,
           count(*) filter (where mi.role_in_plate in (select plate_role from cur where plate_role is not null)) as role_hits,
           coalesce(sum((select count(*) from unnest(r.flavor_tags) f where f in (select unnest(flavor_tags) from cur))), 0) as flavor_hits,
           bool_or(public.recipe_has_allergen(r.id, excl)) as has_allergen
    from public.meal_plates p
    join public.meal_plate_items mi on mi.plate_id = p.id
    join public.recipes r on r.id = mi.recipe_id and r.status = 'live'
    group by p.id
  )
  select pl.id, pl.title, pl.summary, pl.country_code, pl.cuisine_tags, pl.rids, pl.titles,
         round((0.5 * least(pl.arch_hits, 3) / 3.0 + 0.3 * least(pl.role_hits, 3) / 3.0 + 0.2 * least(pl.flavor_hits, 5) / 5.0)::numeric, 4),
         pl.arch_hits::int,
         array(select distinct i.canonical_name from public.recipe_ingredients ri join public.ingredients i on i.id = ri.ingredient_id
               where ri.recipe_id = any (pl.rids) and ri.ingredient_id in (select unnest(ids) from cur_ings) order by 1),
         jsonb_build_object('archetype_matches', pl.arch_hits, 'role_matches', pl.role_hits, 'flavor_matches', pl.flavor_hits)
  from plates pl, cur_tags ct
  where not pl.has_allergen
    and not (pl.cuisine_tags && ct.cuisines)          -- a different kitchen
    and (pl.arch_hits > 0 or pl.role_hits > 0)
    and not (pl.rids && p_current_recipe_ids)
  order by 8 desc, pl.title
  limit least(greatest(coalesce(p_limit, 4), 1), 20);
end;
$$;

create or replace function public.get_underserved_cuisines(p_min_selections integer default 3)
returns table (cuisine text, selections bigint, households bigint, verified_recipes bigint, avg_rating numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin()
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and session_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query
  with demand as (
    select e.cuisine, count(*) as selections, count(distinct e.household_id) as hh
    from public.cuisine_selection_events e
    where e.created_at >= now() - interval '30 days' and e.selection_type = 'country'
    group by e.cuisine
    having count(distinct e.household_id) >= coalesce(p_min_selections, 3)
  )
  select d.cuisine, d.selections, d.hh,
         (select count(*) from public.recipes r where r.status = 'live' and r.verification_status in ('source_verified', 'curated') and d.cuisine = any (r.cuisine_tags)),
         (select round(avg(f.rating)::numeric, 2) from public.cook_feedback f join public.recipes r on r.id = f.recipe_id
           where d.cuisine = any (r.cuisine_tags) and f.cooked_at >= now() - interval '30 days')
  from demand d
  where (select count(*) from public.recipes r where r.status = 'live' and r.verification_status in ('source_verified', 'curated') and d.cuisine = any (r.cuisine_tags)) < 8
     or coalesce((select avg(f.rating) from public.cook_feedback f join public.recipes r on r.id = f.recipe_id
                  where d.cuisine = any (r.cuisine_tags) and f.cooked_at >= now() - interval '30 days'), 5) < 3.8
  order by d.hh desc, d.selections desc;
end;
$$;

-- Admin tools for the review queue.
create or replace function public.map_submission_ingredient(p_submission_id uuid, p_raw_name text, p_ingredient_id uuid, p_add_alias boolean default true)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  nr jsonb;
  items jsonb;
  unresolved int;
  new_status text;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  select normalized_recipe into nr from public.recipe_submissions where id = p_submission_id for update;
  if nr is null then raise exception 'submission not found' using errcode = 'P0002'; end if;
  select jsonb_agg(case when lower(btrim(x ->> 'raw_name')) = lower(btrim(p_raw_name))
                        then x || jsonb_build_object('ingredient_id', p_ingredient_id, 'match', 'admin')
                        else x end order by ord)
    into items
  from jsonb_array_elements(nr -> 'ingredients') with ordinality as t(x, ord);
  select count(*) into unresolved from jsonb_array_elements(items) x where x ->> 'ingredient_id' is null;
  new_status := case when unresolved = 0 then 'pending_review' else 'needs_ingredient_mapping' end;
  update public.recipe_submissions
     set normalized_recipe = jsonb_set(nr, '{ingredients}', items),
         automated_checks = jsonb_set(automated_checks, '{unresolved}', (select coalesce(jsonb_agg(x ->> 'raw_name'), '[]'::jsonb) from jsonb_array_elements(items) x where x ->> 'ingredient_id' is null)),
         status = case when status in ('approved', 'rejected') then status else new_status end
   where id = p_submission_id;
  if p_add_alias then
    insert into public.ingredient_names (ingredient_id, name, language_code, is_variant)
    values (p_ingredient_id, left(btrim(p_raw_name), 120), 'en', true) on conflict do nothing;
  end if;
  return new_status;
end;
$$;

create or replace function public.create_kb_ingredient(p_name text, p_category text, p_unit text default 'g', p_allergens text[] default '{}', p_kind text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  s text := base;
  n int := 1;
  new_id uuid;
  a text;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  while exists (select 1 from public.ingredients where slug = s) loop n := n + 1; s := base || '-' || n; end loop;
  insert into public.ingredients (slug, app_key, canonical_name, category, kind, default_pack_unit, pack_quantity, pack_label)
  values (s, 'kb_' || replace(s, '-', '_'), btrim(p_name), p_category, p_kind, p_unit, case when p_unit = 'pc' then 1 else 100 end, case when p_unit = 'pc' then 'each' else null end)
  returning id into new_id;
  insert into public.ingredient_names (ingredient_id, name, is_canonical) values (new_id, btrim(p_name), true);
  foreach a in array coalesce(p_allergens, '{}') loop
    insert into public.ingredient_allergens (ingredient_id, allergen_key, presence, source_id) values (new_id, a, 'contains', 'luka_curation') on conflict do nothing;
  end loop;
  return new_id;
end;
$$;

-- Promote an approved submission into recipes, recipe_ingredients and recipe_steps, atomically.
create or replace function public.approve_recipe_submission(p_submission_id uuid, p_verification_status text default 'source_verified', p_reviewer_notes text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.recipe_submissions%rowtype;
  nr jsonb;
  rid text;
  base_slug text;
  s text;
  k int := 1;
  app jsonb;
  steps_text text;
  kb_steps text;
  app_ings jsonb := '[]'::jsonb;
  defs jsonb := '{}'::jsonb;
  item jsonb;
  ord int;
  ing public.ingredients%rowtype;
  step text;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if p_verification_status not in ('unverified', 'source_verified', 'curated') then raise exception 'bad verification status'; end if;
  select * into sub from public.recipe_submissions where id = p_submission_id for update;
  if not found then raise exception 'submission not found' using errcode = 'P0002'; end if;
  if sub.status = 'approved' then return sub.promoted_recipe_id; end if;
  nr := sub.normalized_recipe;
  if exists (select 1 from jsonb_array_elements(nr -> 'ingredients') x where x ->> 'ingredient_id' is null) then
    raise exception 'map every ingredient before approving' using errcode = '23514';
  end if;
  if sub.source_channel in ('partner_feed', 'permitted_open_source', 'public_domain') and not sub.license_verified then
    raise exception 'confirm the licence before approving' using errcode = '23514';
  end if;

  base_slug := left(trim(both '-' from regexp_replace(lower(nr ->> 'title'), '[^a-z0-9]+', '-', 'g')), 70);
  s := base_slug;
  while exists (select 1 from public.recipes where slug = s) loop k := k + 1; s := base_slug || '-' || k; end loop;
  rid := 'kb_' || replace(s, '-', '_');

  -- Build the app-format ingredient list from the mapped canonical ingredients, and point
  -- step placeholders ({@N} = N-th ingredient) at their app keys so Cook Mode can scale them.
  steps_text := coalesce(nr -> 'app_recipe' -> 'steps', nr -> 'steps', '[]'::jsonb)::text;
  kb_steps := coalesce(nr -> 'steps', '[]'::jsonb)::text;
  for item, ord in select x, o from jsonb_array_elements(nr -> 'ingredients') with ordinality as t(x, o) loop
    select * into ing from public.ingredients where id = (item ->> 'ingredient_id')::uuid;
    app_ings := app_ings || jsonb_build_array(jsonb_build_object('key', ing.app_key, 'qty', (item ->> 'quantity')::numeric));
    steps_text := replace(replace(steps_text, '{@' || ord || '}', '{' || ing.app_key || '}'), '{@' || ord || '*', '{' || ing.app_key || '*');
    kb_steps := regexp_replace(kb_steps, '\{@' || ord || '(\*[0-9.]+)?\}', lower(replace(replace(ing.canonical_name, '"', ''), '\', '')), 'g');
  end loop;
  app := coalesce(nr -> 'app_recipe', '{}'::jsonb) || jsonb_build_object(
    'id', rid, 'name', nr ->> 'title', 'countries', coalesce(nr -> 'cuisine_tags', '[]'::jsonb), 'ingredients', app_ings,
    'meals', coalesce(nr -> 'meals', '["d"]'::jsonb), 'steps', steps_text::jsonb,
    'source', jsonb_strip_nulls(jsonb_build_object('type', case sub.origin_type when 'claude' then 'ai' when 'user' then 'user' else 'library' end,
                                 'credit', coalesce(nr ->> 'attribution', nr ->> 'credit'), 'url', nr ->> 'source_url', 'license', nr ->> 'license')));
  select coalesce(jsonb_object_agg(d.key, d.def), '{}'::jsonb) into defs
  from public.app_ingredient_defs d
  where d.key in (select x ->> 'key' from jsonb_array_elements(app_ings) x);

  insert into public.recipes (id, slug, title, summary, cuisine_tags, meals, recipe, app_ingredients, origin_type, origin_ref,
                              license, attribution, source_url,
                              created_by_household_id, created_by, plate_role, flavor_tags, prep_minutes, cook_minutes, servings,
                              verification_status, status)
  values (rid, s, nr ->> 'title', nr ->> 'summary',
          array(select jsonb_array_elements_text(coalesce(nr -> 'cuisine_tags', '[]'::jsonb))),
          array(select jsonb_array_elements_text(coalesce(nr -> 'meals', '["d"]'::jsonb))),
          app, defs, sub.origin_type, nr ->> 'origin_ref', nr ->> 'license', nr ->> 'attribution', nr ->> 'source_url',
          sub.submitted_by_household_id, sub.submitted_by_user_id,
          nr ->> 'plate_role', array(select jsonb_array_elements_text(coalesce(nr -> 'flavor_tags', '[]'::jsonb))),
          (nr ->> 'prep_minutes')::int, (nr ->> 'cook_minutes')::int, coalesce((nr ->> 'servings')::numeric, 4),
          p_verification_status, 'live');

  for item, ord in select x, o from jsonb_array_elements(nr -> 'ingredients') with ordinality as t(x, o) loop
    insert into public.recipe_ingredients (recipe_id, ingredient_id, quantity, unit, grams_equivalent, preparation_note, is_optional, sort_order)
    values (rid, (item ->> 'ingredient_id')::uuid, (item ->> 'quantity')::numeric, coalesce(item ->> 'unit', 'g'),
            (item ->> 'grams_equivalent')::numeric, item ->> 'preparation_note', coalesce((item ->> 'is_optional')::boolean, false), ord);
  end loop;
  ord := 0;
  -- Knowledge-base steps read as plain text, with ingredient names in place of placeholders.
  for step in select jsonb_array_elements_text(kb_steps::jsonb) loop
    ord := ord + 1;
    insert into public.recipe_steps (recipe_id, step_number, instruction, timer_minutes)
    values (rid, ord, step, (regexp_match(step, '\[t(\d+)\]'))[1]::int);
  end loop;

  update public.recipe_submissions
     set status = 'approved', promoted_recipe_id = rid, reviewer_notes = p_reviewer_notes, reviewed_by = (select auth.uid()), reviewed_at = now()
   where id = p_submission_id;
  return rid;
end;
$$;

create or replace function public.reject_recipe_submission(p_submission_id uuid, p_reviewer_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  update public.recipe_submissions
     set status = 'rejected', reviewer_notes = p_reviewer_notes, reviewed_by = (select auth.uid()), reviewed_at = now()
   where id = p_submission_id and status <> 'approved';
end;
$$;

-- A reviewer confirms a source's licence (e.g. a public-domain book whose date LUKA couldn't tell).
create or replace function public.confirm_submission_license(p_submission_id uuid, p_license_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if coalesce(btrim(p_license_notes), '') = '' then raise exception 'say why the licence is clear' using errcode = '23514'; end if;
  update public.recipe_submissions
     set license_verified = true, license_notes = p_license_notes || ' (confirmed ' || to_char(now(), 'YYYY-MM-DD') || ')'
   where id = p_submission_id and status <> 'approved';
end;
$$;
revoke all on function public.confirm_submission_license(uuid, text) from public, anon;
grant execute on function public.confirm_submission_license(uuid, text) to authenticated;

revoke all on function public.fn_apply_cook_feedback(), public.fn_sync_household_profile(), public.recipe_has_allergen(text, text[]),
  public.get_planner_recommendations(uuid, integer), public.find_similar_dishes(text, boolean, integer),
  public.suggest_palette_expansions(uuid, text[], integer), public.get_underserved_cuisines(integer),
  public.map_submission_ingredient(uuid, text, uuid, boolean), public.create_kb_ingredient(text, text, text, text[], text),
  public.approve_recipe_submission(uuid, text, text), public.reject_recipe_submission(uuid, text) from public, anon;
grant execute on function public.recipe_has_allergen(text, text[]), public.get_planner_recommendations(uuid, integer),
  public.find_similar_dishes(text, boolean, integer), public.suggest_palette_expansions(uuid, text[], integer),
  public.get_underserved_cuisines(integer), public.map_submission_ingredient(uuid, text, uuid, boolean),
  public.create_kb_ingredient(text, text, text, text[], text), public.approve_recipe_submission(uuid, text, text),
  public.reject_recipe_submission(uuid, text) to authenticated;

-- Sources LUKA draws on (idempotent).
insert into public.data_sources (id, name, url, license, sync_cadence) values
  ('luka_baseline', 'LUKA baseline catalogue', null, 'LUKA', 'static'),
  ('luka_curation', 'LUKA editorial curation', null, 'LUKA', 'manual'),
  ('usda_fdc', 'USDA FoodData Central', 'https://fdc.nal.usda.gov', 'Public domain (CC0)', 'quarterly'),
  ('hc_cnf', 'Health Canada Canadian Nutrient File', 'https://food-nutrition.canada.ca/cnf-fce/', 'Open Government Licence – Canada', 'quarterly'),
  ('fao_wafct_2019', 'FAO/INFOODS West African Food Composition Table (2019)', 'https://www.fao.org/infoods', 'FAO terms of use', 'static'),
  ('open_food_facts', 'Open Food Facts', 'https://world.openfoodfacts.org', 'ODbL', 'weekly'),
  ('statcan_18100245', 'Statistics Canada Table 18-10-0245-01 Monthly average retail prices', 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810024501', 'Statistics Canada Open Licence', 'monthly'),
  ('wikidata', 'Wikidata', 'https://www.wikidata.org', 'CC0', 'manual'),
  ('foodon', 'FoodOn ontology', 'https://foodon.org', 'CC BY 4.0', 'manual'),
  ('themealdb', 'TheMealDB (facts only: dish, country, ingredient list)', 'https://www.themealdb.com', 'Listing; methods are third-party text and are not copied', 'manual'),
  ('wikibooks_cookbook', 'Wikibooks Cookbook', 'https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents', 'CC BY-SA 4.0 (share-alike)', 'manual'),
  ('public_domain_books', 'Public-domain cookbooks (Project Gutenberg, Internet Archive, Feeding America)', 'https://www.gutenberg.org/ebooks/bookshelf/419', 'Public domain', 'manual')
on conflict (id) do update set name = excluded.name, url = excluded.url, license = excluded.license, sync_cadence = excluded.sync_cadence;
