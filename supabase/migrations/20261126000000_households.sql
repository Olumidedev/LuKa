-- Luka: accounts, households and cloud sync (BRD v3.2 §5 Day-1 baseline).
-- Every table is deny-by-default under row-level security. Households are
-- isolated by membership; writes that need extra checks go through
-- SECURITY DEFINER functions with a fixed search_path.

-- ── Profiles ────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Households ──────────────────────────────────────────────────────────
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My household' check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

-- The whole local-first app state for a household, versioned for
-- optimistic concurrency (a write must name the version it read).
create table public.household_state (
  household_id uuid primary key references public.households (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint household_state_size check (pg_column_size(state) < 512000)
);

create table public.household_invites (
  code text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

-- Membership check used by policies. SECURITY DEFINER avoids recursive RLS.
create or replace function public.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Every state write bumps the version by exactly one and records who wrote it.
create or replace function public.household_state_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version <> old.version + 1 then
    raise exception 'version must increase by 1 (have %, got %)', old.version, new.version
      using errcode = '40001';
  end if;
  if new.household_id <> old.household_id then
    raise exception 'household_id is immutable';
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger household_state_guard
  before update on public.household_state
  for each row execute function public.household_state_guard();

-- ── Row-level security ──────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_state enable row level security;
alter table public.household_invites enable row level security;

create policy "own profile: read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members read household" on public.households
  for select to authenticated using (public.is_member(id));
create policy "owners rename household" on public.households
  for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));

create policy "members see each other" on public.household_members
  for select to authenticated using (public.is_member(household_id));
create policy "leave, or owner removes" on public.household_members
  for delete to authenticated using (user_id = (select auth.uid()) or public.is_owner(household_id));

create policy "members read state" on public.household_state
  for select to authenticated using (public.is_member(household_id));
create policy "members write state" on public.household_state
  for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy "members see invites" on public.household_invites
  for select to authenticated using (public.is_member(household_id));
create policy "members revoke invites" on public.household_invites
  for delete to authenticated using (public.is_member(household_id));

-- Column-level grants: nobody can make themselves an admin or forge authorship.
revoke all on public.profiles, public.households, public.household_members,
  public.household_state, public.household_invites from anon, authenticated;
grant select on public.profiles, public.households, public.household_members,
  public.household_state, public.household_invites to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (name) on public.households to authenticated;
grant update (state, version) on public.household_state to authenticated;
grant delete on public.household_members, public.household_invites to authenticated;

-- ── Functions the app calls ─────────────────────────────────────────────
create or replace function public.create_household(p_name text, p_state jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
begin
  if uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if (select count(*) from public.household_members where user_id = uid and role = 'owner') >= 5 then
    raise exception 'you already own 5 households' using errcode = '54000';
  end if;
  insert into public.households (name, created_by)
    values (coalesce(nullif(trim(p_name), ''), 'My household'), uid)
    returning id into hid;
  insert into public.household_members (household_id, user_id, role) values (hid, uid, 'owner');
  insert into public.household_state (household_id, state, version, updated_by)
    values (hid, coalesce(p_state, '{}'::jsonb), 1, uid);
  return hid;
end;
$$;

create or replace function public.create_invite(p_household uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  if not public.is_member(p_household) then raise exception 'not a member' using errcode = '42501'; end if;
  delete from public.household_invites where household_id = p_household and expires_at < now();
  code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  insert into public.household_invites (code, household_id, created_by)
    values (code, p_household, (select auth.uid()));
  return code;
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
begin
  if uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select household_id into hid from public.household_invites
    where code = p_code and expires_at > now();
  if hid is null then raise exception 'invite not found or expired' using errcode = 'P0002'; end if;
  if (select count(*) from public.household_members where household_id = hid) >= 20 then
    raise exception 'household is full' using errcode = '54000';
  end if;
  insert into public.household_members (household_id, user_id, role)
    values (hid, uid, 'member') on conflict do nothing;
  return hid;
end;
$$;

revoke all on function public.create_household(text, jsonb), public.create_invite(uuid),
  public.join_household(text), public.is_member(uuid), public.is_owner(uuid) from public, anon;
grant execute on function public.create_household(text, jsonb), public.create_invite(uuid),
  public.join_household(text), public.is_member(uuid), public.is_owner(uuid) to authenticated;
