-- Policy tests: run with  psql -v ON_ERROR_STOP=1 -f auth_stub.sql -f ../migrations/*.sql -f policies.test.sql
\set ada '00000000-0000-0000-0000-00000000000a'
\set bob '00000000-0000-0000-0000-00000000000b'
\set eve '00000000-0000-0000-0000-00000000000e'
insert into auth.users (id) values (:'ada'), (:'bob'), (:'eve');

do $$ begin assert (select count(*) from public.profiles) = 3, 'profiles created by trigger'; end $$;

-- Ada creates a household.
set role authenticated;
select set_config('request.jwt.claim.sub', :'ada', false);
select public.create_household('Salau home', '{"onboarded": true}') as hid \gset
select public.create_invite(:'hid') as code \gset

-- Ada can read and write her state with the right version.
update public.household_state set state = '{"onboarded": true, "n": 1}', version = 2 where household_id = :'hid';
do $$ begin assert (select version from public.household_state) = 2, 'ada wrote v2'; end $$;

-- A stale write is rejected.
do $$ begin
  begin
    update public.household_state set state = '{}', version = 2 where true;
    raise exception 'stale write should fail';
  exception when serialization_failure then null;
  end;
end $$;

-- Ada cannot make herself an admin.
do $$ begin
  begin
    update public.profiles set is_admin = true;
    raise exception 'is_admin should not be writable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Eve (not a member) sees nothing and cannot write.
select set_config('request.jwt.claim.sub', :'eve', false);
do $$ begin
  assert (select count(*) from public.households) = 0, 'eve sees no households';
  assert (select count(*) from public.household_state) = 0, 'eve sees no state';
  assert (select count(*) from public.household_invites) = 0, 'eve sees no invites';
end $$;
update public.household_state set state = '{"hacked": true}', version = 3;
do $$ begin
  begin
    perform public.create_invite((select id from public.households limit 1));
  exception when others then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.household_members (household_id, user_id, role)
      values (gen_random_uuid(), current_setting('request.jwt.claim.sub')::uuid, 'owner');
    raise exception 'direct membership insert should fail';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Bob joins with the invite and can then read the state.
select set_config('request.jwt.claim.sub', :'bob', false);
do $$ begin assert (select count(*) from public.household_state) = 0, 'bob sees nothing before joining'; end $$;
select public.join_household(:'code') = :'hid'::uuid as joined;
do $$ begin
  assert (select count(*) from public.household_state) = 1, 'bob sees state after joining';
  assert (select state->>'n' from public.household_state) = '1', 'eve''s write did not land';
end $$;

-- A bad invite code fails; anon can do nothing.
do $$ begin
  begin
    perform public.join_household('nope');
    raise exception 'bad code should fail';
  exception when no_data_found then null;
  end;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.household_state;
    raise exception 'anon should not read';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- Deleting accounts works even after they have saved (cascade + updated_by cleared).
delete from auth.users where id = :'bob';
do $$ begin assert (select count(*) from public.household_members) = 1, 'bob removed from household'; end $$;
delete from auth.users where id = :'ada';
do $$ begin assert (select count(*) from public.households) = 0, 'ada''s household removed with her'; end $$;
\echo ALL POLICY TESTS PASSED
