-- Knowledge-base tests. Run after auth_stub.sql, all migrations and seed.sql (see run.sh).
\set ada '00000000-0000-0000-0000-00000000aa01'
\set eve '00000000-0000-0000-0000-00000000ee01'
\set bob '00000000-0000-0000-0000-00000000bb01'
insert into auth.users (id, email) values (:'ada', 'ada@example.com'), (:'eve', 'eve@example.com'), (:'bob', 'bob@example.com');
update public.profiles set is_admin = true where id = :'bob';

-- 1. Ingredient resolution: regional names, fuzzy spellings, unknowns.
do $$
declare r record;
begin
  select * into r from public.resolve_ingredient_names(array['ugu']) limit 1;
  assert r.slug = 'fluted-pumpkin-leaves', 'ugu resolves to fluted pumpkin leaves, got ' || coalesce(r.slug, 'null');
  select * into r from public.resolve_ingredient_names(array['fluted pumpkin leaf']) limit 1;
  assert r.slug = 'fluted-pumpkin-leaves' and r.score < 1, 'fuzzy match works';
  select * into r from public.resolve_ingredient_names(array['ata rodo']) limit 1;
  assert r.slug = 'scotch-bonnet-pepper', 'Yoruba name resolves';
  select * into r from public.resolve_ingredient_names(array['ewa oloyin']) limit 1;
  assert r.slug = 'honey-beans', 'ewa oloyin resolves';
  select * into r from public.resolve_ingredient_names(array['unobtainium paste']) limit 1;
  assert r.ingredient_id is null, 'unknown stays unresolved';
end $$;

-- 2. Ada's household: peanut allergy + Nigeria picked; the profile trigger fills exclusions and logs demand.
set role authenticated;
select set_config('request.jwt.claim.sub', :'ada', false);
select public.create_household('Ada home', '{"version":1,"onboarded":true,"members":[{"name":"Ada","allergies":["peanut"],"diet":"","rules":["halal"]}],"cuisines":[{"type":"country","value":"Nigeria"},{"type":"country","value":"Jamaica"}]}') as hid \gset
reset role;
do $$ begin
  assert (select allergen_exclusions from public.households where name = 'Ada home') = array['peanut'], 'allergen exclusions synced';
  assert (select dietary_restrictions from public.households where name = 'Ada home') = array['halal'], 'rules synced';
  assert (select count(*) from public.cuisine_selection_events) = 2, 'two cuisine picks logged';
end $$;

-- 3. Recommendations: verified mains only, never an allergen.
set role authenticated;
select set_config('request.jwt.claim.sub', :'ada', false);
do $$
declare hid uuid := (select id from public.households where name = 'Ada home');
begin
  assert (select count(*) from public.get_planner_recommendations(hid, 200)) > 30, 'plenty of recommendations';
  assert not exists (select 1 from public.get_planner_recommendations(hid, 200) where recipe_id in ('fx_suya', 'in_poha', 'vn_bun')), 'peanut dishes excluded';
  assert not exists (select 1 from public.get_planner_recommendations(hid, 200) where recipe_id in ('ng_dodo', 'jm_rice_and_peas', 'in_pazham_pori')), 'sides are not recommended as meals';
end $$;

-- 4. Similar dishes: Dodo's peers in other kitchens come first.
do $$
declare top text[];
begin
  select array_agg(recipe_id order by score desc) into top from public.find_similar_dishes('ng_dodo', true, 3);
  assert top[1:2] @> array['jm_fried_ripe_plantain', 'in_pazham_pori'] or top[1:2] <@ array['jm_fried_ripe_plantain', 'in_pazham_pori'],
    'fried-plantain peers lead, got ' || array_to_string(top, ',');
  assert (select (reasons ->> 'same_archetype')::boolean from public.find_similar_dishes('ng_dodo', true, 5) where recipe_id = 'in_pazham_pori'), 'archetype is the reason';
end $$;

-- 5. Palette expansion: Nigerian Rice & Beans + Dodo bridges to the Jamaican plate.
do $$
declare hid uuid := (select id from public.households where name = 'Ada home');
declare r record;
begin
  select * into r from public.suggest_palette_expansions(hid, array['ng_rice_and_beans', 'ng_dodo'], 4) limit 1;
  assert r.plate_title = 'Jamaican Rice & Peas with Jerk Chicken & Fried Plantain', 'Jamaican plate suggested, got ' || coalesce(r.plate_title, 'none');
  assert r.shared_archetypes >= 2, 'shares two archetypes (legumes+rice, fried plantain)';
  assert 'Ripe plantains' = any (r.shared_pantry), 'plantain is shared pantry';
end $$;

-- 6. Cook feedback updates ratings and taste.
insert into public.cook_feedback (household_id, recipe_id, rating, quick_tags)
values ((select id from public.households where name = 'Ada home'), 'ng_rice_and_beans', 5, array['household_hit', 'repeat_staple']);
reset role;
do $$ begin
  assert (select rating_count from public.recipes where id = 'ng_rice_and_beans') = 1, 'rating counted';
  assert (select avg_rating from public.recipes where id = 'ng_rice_and_beans') = 5, 'average updated';
  assert (select (cuisine_weights ->> 'Nigeria')::numeric from public.household_taste_profiles) = 1.3, 'Nigeria weight nudged up';
  assert (select (ingredient_weights ->> 'honey-beans')::numeric from public.household_taste_profiles) = 1.1, 'honey beans weight nudged up';
end $$;

-- 7. Eve (not a member) is kept out.
set role authenticated;
select set_config('request.jwt.claim.sub', :'eve', false);
do $$
declare hid uuid := (select h.id from public.households h limit 1);
begin
  assert hid is null, 'eve cannot even see the household';
  begin
    perform public.get_planner_recommendations((select id from public.recipes limit 0)::uuid, 5);
  exception when others then null;
  end;
  begin
    insert into public.cook_feedback (household_id, recipe_id, rating) values (gen_random_uuid(), 'ng_dodo', 1);
    raise exception 'eve must not post feedback';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
  assert (select count(*) from public.household_taste_profiles) = 0, 'eve sees no taste profiles';
  assert (select count(*) from public.ingredients) = 130, 'knowledge base readable by any signed-in user';
  begin
    perform public.approve_recipe_submission(gen_random_uuid());
    raise exception 'eve must not approve';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 8. Demand: three households pick Burkina Faso, which has no verified recipes.
insert into public.households (id, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'h1', :'eve'), ('00000000-0000-0000-0000-0000000000b2', 'h2', :'eve'), ('00000000-0000-0000-0000-0000000000b3', 'h3', :'eve');
insert into public.cuisine_selection_events (household_id, cuisine) values
  ('00000000-0000-0000-0000-0000000000b1', 'Burkina Faso'), ('00000000-0000-0000-0000-0000000000b2', 'Burkina Faso'), ('00000000-0000-0000-0000-0000000000b3', 'Burkina Faso'),
  ('00000000-0000-0000-0000-0000000000b1', 'Nigeria'), ('00000000-0000-0000-0000-0000000000b2', 'Nigeria');
do $$ begin
  assert exists (select 1 from public.get_underserved_cuisines(3) where cuisine = 'Burkina Faso' and verified_recipes = 0), 'Burkina Faso is underserved';
  assert not exists (select 1 from public.get_underserved_cuisines(3) where cuisine = 'Nigeria'), 'Nigeria is well served';
end $$;

-- 9. Intake: a Claude submission with one unmapped ingredient, mapped and approved by an admin.
insert into public.recipe_submissions (id, source_channel, origin_type, raw_payload, normalized_recipe, automated_checks, status) values (
  '00000000-0000-0000-0000-00000000c001', 'weekly_gap_agent', 'claude', '{"from":"test"}',
  ('{"title":"Riz Gras","summary":"Burkinabè rice in tomato sauce.","cuisine_tags":["Burkina Faso"],"meals":["d"],"plate_role":"main_one_pot","prep_minutes":20,"cook_minutes":40,
    "ingredients":[{"raw_name":"rice","ingredient_id":"' || (select id from public.ingredients where app_key = 'rice') || '","quantity":400,"unit":"g"},
                   {"raw_name":"soumbala","ingredient_id":null,"quantity":15,"unit":"g"}],
    "steps":["Cook {@1} with tomato and {@2*0.5} [t25].","Stir in the rest of {@2}."],
    "app_recipe":{"activeMin":20,"totalMin":60,"spice":1,"batch":true,"steps":["Cook {@1} with tomato and {@2*0.5} [t25].","Stir in the rest of {@2}."]}}')::jsonb,
  '{"unresolved":["soumbala"]}', 'needs_ingredient_mapping');
set role authenticated;
select set_config('request.jwt.claim.sub', :'bob', false);
do $$
declare new_ing uuid; rid text; st text;
begin
  begin
    perform public.approve_recipe_submission('00000000-0000-0000-0000-00000000c001');
    raise exception 'cannot approve with unmapped ingredients';
  exception when check_violation then null;
  end;
  new_ing := public.create_kb_ingredient('Soumbala (fermented néré seeds)', 'condiments', 'g', '{}');
  st := public.map_submission_ingredient('00000000-0000-0000-0000-00000000c001', 'soumbala', new_ing, true);
  assert st = 'pending_review', 'all mapped → pending review';
  rid := public.approve_recipe_submission('00000000-0000-0000-0000-00000000c001', 'curated', 'Checked by reviewer');
  assert (select count(*) from public.recipe_ingredients where recipe_id = rid) = 2, 'ingredients promoted';
  assert (select instruction from public.recipe_steps where recipe_id = rid and step_number = 1) like 'Cook long-grain rice with tomato and soumbala%', 'kb steps name ingredients';
  assert (select timer_minutes from public.recipe_steps where recipe_id = rid and step_number = 1) = 25, 'timer kept';
  assert (select recipe -> 'steps' ->> 0 from public.recipes where id = rid) like 'Cook {rice} with tomato and {kb_soumbala%*0.5}%', 'app steps rewritten to app keys';
  assert (select app_ingredients ? 'kb_soumbala_fermented-n-r-seeds' or app_ingredients::text like '%kb_soumbala%' from public.recipes where id = rid), 'app ingredient defs embedded';
  assert (select status from public.recipe_submissions where id = '00000000-0000-0000-0000-00000000c001') = 'approved', 'submission approved';
  assert exists (select 1 from public.ingredient_names where name = 'soumbala'), 'alias learned';
end $$;
reset role;

-- 10. App ingredient definitions prefer source prices over the baseline.
do $$
declare before numeric; after numeric;
begin
  before := (select (def ->> 'price')::numeric from public.app_ingredient_defs where key = 'tomato');
  insert into public.ingredient_prices (ingredient_id, source_id, price_amount, pack_quantity, pack_unit, normalized_price_per_kg, period_start, source_series_id)
  values ((select id from public.ingredients where app_key = 'tomato'), 'statcan_18100245', 5.00, 1, 'kg', 5.00, '2026-09-01', 'v1');
  after := (select (def ->> 'price')::numeric from public.app_ingredient_defs where key = 'tomato');
  assert after = round(5.00 * 125 / 1000, 2), 'statcan price used for one tomato pack, got ' || after;
  assert (select def ->> 'priceSource' from public.app_ingredient_defs where key = 'tomato') = 'statcan_18100245:2026-09', 'price source reported';
  assert (select (def -> 'nutrition' ->> 'kcal')::numeric from public.app_ingredient_defs where key = 'eggs') = 72, 'per-piece nutrition restored for eggs';
end $$;

-- 11. Licence gate: public-domain submissions need a confirmed licence; licence and attribution reach the recipe.
insert into public.recipe_submissions (id, source_channel, origin_type, license_verified, raw_payload, normalized_recipe, status) values (
  '00000000-0000-0000-0000-00000000c002', 'public_domain', 'claude', false, '{}',
  ('{"title":"Pepper Pot","cuisine_tags":["Jamaica"],"meals":["d"],"license":"Public domain source; LUKA adaptation","attribution":"Adapted by LUKA from an 1893 cookbook",
    "source_url":"https://www.gutenberg.org/ebooks/1#Pepper%20Pot",
    "ingredients":[{"raw_name":"rice","ingredient_id":"' || (select id from public.ingredients where app_key = 'rice') || '","quantity":300,"unit":"g"},
                   {"raw_name":"onion","ingredient_id":"' || (select id from public.ingredients where app_key = 'onion') || '","quantity":1,"unit":"pc"}],
    "steps":["Soften {@2}.","Add {@1} and simmer [t20]."],"app_recipe":{"activeMin":15,"totalMin":40,"spice":1,"batch":false,"steps":["Soften {@2}.","Add {@1} and simmer [t20]."]}}')::jsonb,
  'pending_review');
insert into public.recipe_submissions (source_channel, origin_type, raw_payload, normalized_recipe) values ('reference_import', 'claude', '{}', '{}');
set role authenticated;
select set_config('request.jwt.claim.sub', :'bob', false);
do $$
declare rid text;
begin
  begin
    perform public.approve_recipe_submission('00000000-0000-0000-0000-00000000c002');
    raise exception 'unverified public-domain licence must block approval';
  exception when check_violation then null;
  end;
  perform public.confirm_submission_license('00000000-0000-0000-0000-00000000c002', 'Published 1893');
  rid := public.approve_recipe_submission('00000000-0000-0000-0000-00000000c002');
  assert (select license from public.recipes where id = rid) = 'Public domain source; LUKA adaptation', 'licence stored';
  assert (select recipe -> 'source' ->> 'credit' from public.recipes where id = rid) = 'Adapted by LUKA from an 1893 cookbook', 'attribution shown in app';
  assert (select recipe -> 'source' ->> 'url' from public.recipes where id = rid) like 'https://www.gutenberg.org/%', 'source link kept';
end $$;
reset role;
do $$ begin
  begin
    insert into public.recipe_submissions (source_channel, origin_type, raw_payload, normalized_recipe) values ('scraped_blog', 'claude', '{}', '{}');
    raise exception 'unknown channel must be rejected';
  exception when check_violation then null;
  end;
end $$;

-- 12. Embeddings: 1024-d vectors drive the similarity score; editing a recipe clears its vector.
do $$
declare v extensions.vector(1024) := (select array_agg(case when i = 1 then 1.0 else 0.0 end)::extensions.vector(1024) from generate_series(1, 1024) i);
begin
  update public.recipes set embedding = v, embedding_model = 'bge-m3' where id in ('ng_dodo', 'vn_bun');
  assert (select (reasons ->> 'embedding_similarity')::numeric from public.find_similar_dishes('ng_dodo', false, 80) where recipe_id = 'vn_bun') = 1, 'identical vectors score 1';
  update public.recipes set title = 'Dodo (fried ripe plantain)' where id = 'ng_dodo';
  assert (select embedding is null and embedding_model is null from public.recipes where id = 'ng_dodo'), 'edited recipe is re-embedded';
end $$;
\echo ALL KNOWLEDGE BASE TESTS PASSED
