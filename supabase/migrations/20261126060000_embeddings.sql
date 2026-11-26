-- Recipe embeddings come from bge-m3 (Cloudflare Workers AI): multilingual, 1024 dimensions.
-- No embeddings have been written yet, so the column is simply retyped.
alter table public.recipes alter column embedding type extensions.vector(1024) using null::extensions.vector(1024);
alter table public.recipes add column if not exists embedding_model text;
create index if not exists recipes_embedding_idx on public.recipes using hnsw (embedding extensions.vector_cosine_ops);

-- A recipe whose content changes is embedded again.
create or replace function public.fn_recipe_embedding_stale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.title is distinct from old.title or new.cuisine_tags is distinct from old.cuisine_tags
     or new.summary is distinct from old.summary or new.flavor_tags is distinct from old.flavor_tags then
    new.embedding := null;
    new.embedding_model := null;
  end if;
  return new;
end;
$$;
drop trigger if exists recipes_embedding_stale on public.recipes;
create trigger recipes_embedding_stale before update on public.recipes
  for each row execute function public.fn_recipe_embedding_stale();

insert into public.data_sources (id, name, url, license, sync_cadence) values
  ('cloudflare_workers_ai', 'Cloudflare Workers AI (bge-m3 embeddings)', 'https://developers.cloudflare.com/workers-ai/', 'Service (free daily allocation)', 'weekly')
on conflict (id) do update set name = excluded.name, url = excluded.url, license = excluded.license;
