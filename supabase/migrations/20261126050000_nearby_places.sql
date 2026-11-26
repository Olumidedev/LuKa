-- Nearby specialty grocers and restaurants, cached from Geoapify (OpenStreetMap data;
-- Geoapify permits storing results, attribution required). Repeat searches in the same
-- area are answered from here, so they cost no API credits.
--
-- Privacy: only places and coarse search cells (~5 km) are stored. No user id, no
-- household and no exact location is ever written.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create table if not exists public.nearby_places (
  id text primary key,                                  -- 'geoapify:<place_id>'
  name text not null check (char_length(name) between 1 and 200),
  kind text not null check (kind in ('grocer', 'restaurant')),
  categories text[] not null default '{}',
  geom extensions.geography(Point, 4326) not null,
  address text,
  website text,
  source text not null default 'geoapify',
  fetched_at timestamptz not null default now()
);
create index if not exists nearby_places_geom_idx on public.nearby_places using gist (geom);
create index if not exists nearby_places_kind_idx on public.nearby_places (kind);

-- Which (area, category) pairs have been fetched recently.
create table if not exists public.nearby_search_cells (
  cell text primary key check (char_length(cell) <= 300),
  fetched_at timestamptz not null default now(),
  results integer not null default 0
);

-- Server-only tables: no policies, so signed-in users can't read or write them directly.
alter table public.nearby_places enable row level security;
alter table public.nearby_search_cells enable row level security;
revoke all on public.nearby_places, public.nearby_search_cells from anon, authenticated;

create or replace function public.nearby_places_within(
  p_lat double precision, p_lon double precision, p_radius_m integer, p_kind text,
  p_categories text[] default null, p_name_pattern text default null, p_limit integer default 15)
returns table (id text, name text, categories text[], lat double precision, lon double precision, distance_m double precision, address text, website text)
language sql
stable
set search_path = ''
as $$
  with here as (select extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography as g)
  select n.id, n.name, n.categories,
         extensions.st_y(n.geom::extensions.geometry), extensions.st_x(n.geom::extensions.geometry),
         extensions.st_distance(n.geom, here.g), n.address, n.website
  from public.nearby_places n, here
  where n.kind = p_kind
    and extensions.st_dwithin(n.geom, here.g, least(p_radius_m, 25000))
    and (p_categories is null or n.categories && p_categories)
    and (p_name_pattern is null or n.name ~* p_name_pattern)
  order by 6
  limit least(p_limit, 50);
$$;

-- Keeps the cache small: places not seen in a refresh for 120 days are dropped.
create or replace function public.prune_nearby_cache()
returns integer
language sql
set search_path = ''
as $$
  with d as (delete from public.nearby_places where fetched_at < now() - interval '120 days' returning 1),
       c as (delete from public.nearby_search_cells where fetched_at < now() - interval '120 days' returning 1)
  select (select count(*)::int from d) + (select count(*)::int from c);
$$;

revoke all on function public.nearby_places_within(double precision, double precision, integer, text, text[], text, integer), public.prune_nearby_cache() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.nearby_places_within(double precision, double precision, integer, text, text[], text, integer), public.prune_nearby_cache() to service_role;
    grant all on public.nearby_places, public.nearby_search_cells to service_role;
  end if;
end $$;

insert into public.data_sources (id, name, url, license, sync_cadence) values
  ('geoapify', 'Geoapify Places (OpenStreetMap data)', 'https://www.geoapify.com', 'Geoapify free plan (attribution); data © OpenStreetMap contributors, ODbL', 'manual')
on conflict (id) do update set name = excluded.name, url = excluded.url, license = excluded.license;
