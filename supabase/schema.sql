-- All For One: database setup.
-- One table holds every record as JSON, addressed by (collection, id):
--   tasks/<id>, notes/<id>, gymlog/<date>, daily/<date>, weekly/<monday>,
--   habits/log, meta/config, meta/roadmap, meta/investing, insights/<date>
-- Only the owner's signed-in account can read or write it.

create table if not exists public.app_owner (
  email text primary key
);
alter table public.app_owner enable row level security;
-- No policies on app_owner: it cannot be read or changed through the public API.

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_owner
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

create table if not exists public.docs (
  collection text not null,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
alter table public.docs enable row level security;

drop policy if exists "owner can read"   on public.docs;
drop policy if exists "owner can insert" on public.docs;
drop policy if exists "owner can update" on public.docs;
drop policy if exists "owner can delete" on public.docs;
create policy "owner can read"   on public.docs for select to authenticated using (public.is_owner());
create policy "owner can insert" on public.docs for insert to authenticated with check (public.is_owner());
create policy "owner can update" on public.docs for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner can delete" on public.docs for delete to authenticated using (public.is_owner());

-- Live updates in the page.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- After the owner's login exists, register it (replace the address):
-- insert into public.app_owner (email) values ('you@example.com') on conflict do nothing;
