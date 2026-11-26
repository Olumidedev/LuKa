-- Admin & analytics tests. Run after auth_stub.sql, all migrations and policies.test.sql's setup is NOT required.
\set ada '00000000-0000-0000-0000-0000000000a1'
\set eve '00000000-0000-0000-0000-0000000000e1'
insert into auth.users (id, email) values (:'ada', 'ada@example.com'), (:'eve', 'eve@example.com');
update public.profiles set is_admin = true where id = :'ada';
insert into public.usage_events (device_id, user_id, name, props, path) values
  (gen_random_uuid(), :'ada', 'app_opened', '{}', '/'),
  (gen_random_uuid(), null, 'plan_built', '{"type": "5day"}', '/'),
  (gen_random_uuid(), null, 'client_error', '{"message": "boom"}', '/');

set role anon;
do $$ begin assert (select count(*) from public.app_config) = 3, 'anon reads settings'; end $$;
do $$ begin
  begin perform count(*) from public.usage_events; raise exception 'anon must not read events';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Eve: signed in, not admin.
set role authenticated;
select set_config('request.jwt.claim.sub', :'eve', false);
do $$ begin
  begin perform public.admin_overview(30); raise exception 'eve must not see overview';
  exception when insufficient_privilege then null; end;
  begin perform * from public.admin_users(10, 0); raise exception 'eve must not list users';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_set_admin(current_setting('request.jwt.claim.sub')::uuid, true); raise exception 'eve must not self-promote';
  exception when insufficient_privilege then null; end;
  begin insert into public.usage_events (device_id, name) values (gen_random_uuid(), 'app_opened'); raise exception 'clients must not write events';
  exception when insufficient_privilege then null; end;
end $$;
update public.app_config set value = '{"text": "hacked"}' where key = 'announcement';
do $$ begin assert (select value->>'text' from public.app_config where key = 'announcement') = '', 'eve cannot change settings'; end $$;

-- Ada: admin.
select set_config('request.jwt.claim.sub', :'ada', false);
do $$
declare o jsonb := public.admin_overview(30);
begin
  assert (o->'totals'->>'users')::int = 2, 'two users';
  assert (o->'events'->>'plan_built')::int = 1, 'plan_built counted';
  assert (o->'totals'->>'errors')::int = 1, 'one error';
  assert jsonb_array_length(o->'daily') = 30, '30 daily buckets';
end $$;
do $$ begin assert (select count(*) from public.admin_users(10, 0)) = 2, 'admin lists users'; end $$;
do $$ begin assert (select count(*) from public.admin_recent('client_error', 10)) = 1, 'admin sees errors'; end $$;
update public.app_config set value = '{"text": "Hello", "tone": "info"}' where key = 'announcement';
do $$ begin assert (select value->>'text' from public.app_config where key = 'announcement') = 'Hello', 'admin changes settings'; end $$;
do $$ begin
  begin perform public.admin_set_admin(current_setting('request.jwt.claim.sub')::uuid, false); raise exception 'cannot demote self';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo ALL ADMIN TESTS PASSED
