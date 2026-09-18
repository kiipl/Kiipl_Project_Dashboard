-- Run this once in Supabase SQL Editor to enable multi-screen dashboards.
create table if not exists public.dashboard_screens (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.sites add column if not exists screen_id uuid references public.dashboard_screens(id) on delete set null;
insert into public.dashboard_screens (name) values ('Overview') on conflict (name) do nothing;
update public.sites set screen_id=(select id from public.dashboard_screens where name='Overview') where screen_id is null;

alter table public.dashboard_screens enable row level security;
drop policy if exists "screens readable by signed-in users" on public.dashboard_screens;
create policy "screens readable by signed-in users" on public.dashboard_screens for select to authenticated using (true);
drop policy if exists "admins manage screens" on public.dashboard_screens;
create policy "admins manage screens" on public.dashboard_screens for all to authenticated using (public.is_admin()) with check (public.is_admin());
