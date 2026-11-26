-- Fix: deleting an account failed when it had ever saved a household.
-- The ON DELETE SET NULL on household_state.updated_by is an UPDATE that
-- leaves state and version untouched; the version guard rejected it.
-- Clients can only update (state, version) (column grants), so an update
-- that changes neither can only come from the database itself.
create or replace function public.household_state_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state is not distinct from old.state and new.version = old.version then
    return new; -- bookkeeping update (e.g. updated_by cleared on account deletion)
  end if;
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
