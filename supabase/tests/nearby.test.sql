-- Nearby cache: spatial search, filters, and that signed-in users can't touch the cache.
insert into public.nearby_places (id, name, kind, categories, geom, address) values
  ('geoapify:1', 'Naija Foods', 'grocer', '{commercial.convenience}', 'SRID=4326;POINT(-79.38 43.66)', '12 Queen St'),
  ('geoapify:2', 'Big Box Supermarket', 'grocer', '{commercial.supermarket}', 'SRID=4326;POINT(-79.39 43.655)', null),
  ('geoapify:3', 'Far African Market', 'grocer', '{commercial.supermarket}', 'SRID=4326;POINT(-79.3 43.75)', null),
  ('geoapify:4', 'Roywoods', 'restaurant', '{catering.restaurant.jamaican}', 'SRID=4326;POINT(-79.381 43.651)', null),
  ('geoapify:5', 'Pizza Place', 'restaurant', '{catering.restaurant.pizza}', 'SRID=4326;POINT(-79.381 43.651)', null);
do $$
declare r record;
begin
  -- name pattern picks the specialty grocer; the far one is outside 10 km
  assert (select array_agg(name order by distance_m) from public.nearby_places_within(43.65, -79.38, 10000, 'grocer', null, 'afric|naija')) = array['Naija Foods'], 'specialty grocer nearby only';
  assert (select count(*) from public.nearby_places_within(43.65, -79.38, 20000, 'grocer', null, 'afric|naija')) = 2, 'wider radius finds both';
  select * into r from public.nearby_places_within(43.65, -79.38, 6000, 'restaurant', array['catering.restaurant.jamaican', 'catering.restaurant.african']) limit 1;
  assert r.name = 'Roywoods' and r.distance_m < 200, 'cuisine filter + distance';
  assert (select count(*) from public.nearby_places_within(43.65, -79.38, 6000, 'restaurant', array['catering.restaurant.jamaican'])) = 1, 'pizza excluded';
  assert abs(r.lat - 43.651) < 0.0001 and abs(r.lon + 79.381) < 0.0001, 'coordinates returned';
end $$;
set role authenticated;
do $$ begin
  begin
    perform 1 from public.nearby_places limit 1;
    raise exception 'signed-in users must not read the cache';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.nearby_places_within(43.65, -79.38, 1000, 'grocer');
    raise exception 'signed-in users must not call the cache function';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo ALL NEARBY TESTS PASSED
