\set ada '00000000-0000-0000-0000-0000000000a2'
\set eve '00000000-0000-0000-0000-0000000000e2'
insert into auth.users (id) values (:'ada'), (:'eve');
update public.profiles set is_admin = true where id = :'ada';
insert into public.recipes (id, slug, title, cuisine_tags, meals, recipe) values
  ('ai_a', 'ai-a', 'Waakye', '{Ghana}', '{l,d}', '{}'), ('ai_b', 'ai-b', 'Bad dish', '{Ghana}', '{d}', '{}');

set role authenticated;
select set_config('request.jwt.claim.sub', :'eve', false);
do $$ begin
  assert (select count(*) from public.recipes where id like 'ai_%') = 2, 'eve reads live recipes';
  begin insert into public.recipes (id, slug, title, cuisine_tags, meals, recipe) values ('x', 'x', 'x', '{}', '{}', '{}'); raise exception 'clients must not insert';
  exception when insufficient_privilege then null; end;
end $$;
update public.recipes set status = 'hidden' where id = 'ai_b';
do $$ begin assert (select count(*) from public.recipes where status = 'live' and id like 'ai_%') = 2, 'eve cannot hide'; end $$;

select set_config('request.jwt.claim.sub', :'ada', false);
update public.recipes set status = 'hidden' where id = 'ai_b';
do $$ begin assert (select status from public.recipes where id = 'ai_b') = 'hidden', 'admin hides'; end $$;
do $$ begin
  begin update public.recipes set recipe = '{"x":1}' where id = 'ai_a'; raise exception 'recipe body must be read-only';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', :'eve', false);
do $$ begin assert (select count(*) from public.recipes where id like 'ai_%') = 1, 'hidden recipe invisible to eve'; end $$;
reset role;
set role anon;
do $$ begin
  begin perform count(*) from public.recipes; raise exception 'anon must not read';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo ALL CATALOG TESTS PASSED
