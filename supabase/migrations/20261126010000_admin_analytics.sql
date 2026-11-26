-- Luka: admin area, app settings and first-party analytics.
-- Analytics events are written only by the server (service role) via
-- /api/events; clients can't insert or read them. Admins read aggregates
-- through SECURITY DEFINER functions that check profiles.is_admin.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false);
$$;

-- ── App settings (feature switches, announcement, defaults) ────────────
create table public.app_config (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create or replace function public.app_config_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
create trigger app_config_stamp before insert or update on public.app_config
  for each row execute function public.app_config_stamp();

alter table public.app_config enable row level security;
create policy "anyone reads settings" on public.app_config for select to anon, authenticated using (true);
create policy "admins insert settings" on public.app_config for insert to authenticated with check (public.is_admin());
create policy "admins update settings" on public.app_config for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete settings" on public.app_config for delete to authenticated using (public.is_admin());
grant select on public.app_config to anon, authenticated;
grant insert, update, delete on public.app_config to authenticated;

insert into public.app_config (key, value) values
  ('features', '{"instant": true, "fourteen_day": true, "ai_recipes": true, "fridge_scan": true, "handoff": true, "voice": true}'),
  ('announcement', '{"text": "", "tone": "info"}'),
  ('defaults', '{"takeout_per_person": 19}')
on conflict (key) do nothing;

-- ── Usage events (first-party analytics, errors, feedback) ─────────────
create table public.usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  device_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (name ~ '^[a-z_]{2,40}$'),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) < 4000),
  path text check (char_length(path) <= 200)
);
create index usage_events_created_idx on public.usage_events (created_at desc);
create index usage_events_name_created_idx on public.usage_events (name, created_at desc);

alter table public.usage_events enable row level security;
-- No policies: only the service role (server) writes; admins read via functions below.
revoke all on public.usage_events from anon, authenticated;

-- ── Admin functions ─────────────────────────────────────────────────────
create or replace function public.admin_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d integer := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  result jsonb;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  select jsonb_build_object(
    'days', d,
    'totals', jsonb_build_object(
      'users', (select count(*) from auth.users),
      'new_users', (select count(*) from auth.users where created_at >= since),
      'households', (select count(*) from public.households),
      'shared_households', (select count(*) from (select household_id from public.household_members group by 1 having count(*) > 1) s),
      'active_devices', (select count(distinct device_id) from public.usage_events where created_at >= since),
      'active_devices_7d', (select count(distinct device_id) from public.usage_events where created_at >= now() - interval '7 days'),
      'errors', (select count(*) from public.usage_events where name = 'client_error' and created_at >= since),
      'feedback', (select count(*) from public.usage_events where name = 'feedback' and created_at >= since)
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'devices', coalesce(e.devices, 0), 'signups', coalesce(u.signups, 0)) order by g.day), '[]'::jsonb)
      from generate_series(since, date_trunc('day', now()), interval '1 day') as g(day)
      left join (select date_trunc('day', created_at) as day, count(distinct device_id) as devices
                 from public.usage_events where created_at >= since group by 1) e on e.day = g.day
      left join (select date_trunc('day', created_at) as day, count(*) as signups
                 from auth.users where created_at >= since group by 1) u on u.day = g.day
    ),
    'events', (
      select coalesce(jsonb_object_agg(name, n), '{}'::jsonb)
      from (select name, count(*) as n from public.usage_events
            where created_at >= since and name not in ('client_error', 'feedback') group by name) x
    ),
    'funnel', (
      select jsonb_build_object(
        'opened', count(distinct device_id) filter (where name = 'app_opened'),
        'onboarded', count(distinct device_id) filter (where name = 'onboarding_done'),
        'planned', count(distinct device_id) filter (where name = 'plan_built'),
        'shopped', count(distinct device_id) filter (where name in ('list_copied', 'item_in_cart')),
        'cooked', count(distinct device_id) filter (where name = 'cook_started'))
      from public.usage_events where created_at >= since
    ),
    'plan_types', (
      select coalesce(jsonb_object_agg(t, n), '{}'::jsonb)
      from (select coalesce(props->>'type', 'unknown') as t, count(*) as n from public.usage_events
            where created_at >= since and name = 'plan_built' group by 1) x
    ),
    'cuisines', (
      select coalesce(jsonb_agg(jsonb_build_object('name', c, 'households', n) order by n desc), '[]'::jsonb)
      from (select pick->>'value' as c, count(*) as n
            from public.household_state s, jsonb_array_elements(coalesce(s.state->'cuisines', '[]'::jsonb)) pick
            group by 1 order by 2 desc limit 12) x
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_users(p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, provider text, is_admin boolean, households bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
           coalesce(u.raw_app_meta_data->>'provider', 'email'),
           coalesce(p.is_admin, false),
           (select count(*) from public.household_members m where m.user_id = u.id)
    from auth.users u left join public.profiles p on p.id = u.id
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_set_admin(p_user uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) and not p_admin then
    raise exception 'you cannot remove your own admin access' using errcode = '42501';
  end if;
  update public.profiles set is_admin = p_admin where id = p_user;
end;
$$;

create or replace function public.admin_recent(p_kind text, p_limit integer default 100)
returns table (created_at timestamptz, user_email text, path text, props jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if p_kind not in ('client_error', 'feedback') then raise exception 'unknown kind'; end if;
  return query
    select e.created_at, u.email::text, e.path, e.props
    from public.usage_events e left join auth.users u on u.id = e.user_id
    where e.name = p_kind
    order by e.created_at desc
    limit least(greatest(p_limit, 1), 500);
end;
$$;

revoke all on function public.is_admin(), public.admin_overview(integer), public.admin_users(integer, integer),
  public.admin_set_admin(uuid, boolean), public.admin_recent(text, integer) from public, anon;
grant execute on function public.is_admin(), public.admin_overview(integer), public.admin_users(integer, integer),
  public.admin_set_admin(uuid, boolean), public.admin_recent(text, integer) to authenticated;
