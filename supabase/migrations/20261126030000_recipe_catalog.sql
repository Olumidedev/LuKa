-- Luka: shared, growing recipe catalog.
-- Recipes written by Claude (or added by admins) are shared by every household.
-- Only the server (service role) inserts; signed-in people read live recipes;
-- admins can hide, rename or delete. Allergen and diet checks still run per
-- household in the app before anything is planned.

create table public.recipes (
  id text primary key check (char_length(id) <= 120),
  name text not null check (char_length(name) between 1 and 140),
  countries text[] not null,
  meals text[] not null,
  recipe jsonb not null check (pg_column_size(recipe) < 64000),
  ingredients jsonb not null default '{}'::jsonb check (pg_column_size(ingredients) < 64000),
  source text not null default 'ai' check (source in ('ai', 'admin')),
  status text not null default 'live' check (status in ('live', 'hidden')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index recipes_countries_idx on public.recipes using gin (countries);
create index recipes_created_idx on public.recipes (created_at desc);

alter table public.recipes enable row level security;
create policy "signed-in read live recipes; admins read all" on public.recipes
  for select to authenticated using (status = 'live' or public.is_admin());
create policy "admins update recipes" on public.recipes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete recipes" on public.recipes
  for delete to authenticated using (public.is_admin());

revoke all on public.recipes from anon, authenticated;
grant select, delete on public.recipes to authenticated;
grant update (status, name) on public.recipes to authenticated;
