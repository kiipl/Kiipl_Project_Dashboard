-- KIIPL Construction Site Dashboard: run this once in the Supabase SQL Editor.
create extension if not exists pgcrypto;


create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'viewer')) default 'viewer',
  created_at timestamptz not null default now()
);

create table if not exists public.site_columns (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  data_type text not null check (data_type in ('text', 'number', 'date', 'url')) default 'text',
  position integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dashboard_screens (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
alter table public.sites add column if not exists screen_id uuid references public.dashboard_screens(id) on delete set null;
insert into public.dashboard_screens (name) values ('Overview') on conflict (name) do nothing;
update public.sites set screen_id=(select id from public.dashboard_screens where name='Overview') where screen_id is null;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists sites_touch_updated_at on public.sites;
create trigger sites_touch_updated_at before update on public.sites for each row execute procedure public.touch_updated_at();

-- Security helper: only profiles with the admin role can change data or schema.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

insert into storage.buckets (id, name, public) values ('site-images', 'site-images', true) on conflict (id) do nothing;
drop policy if exists "admins upload site images" on storage.objects;
create policy "admins upload site images" on storage.objects for insert to authenticated with check (bucket_id = 'site-images' and public.is_admin());
drop policy if exists "public reads site images" on storage.objects;
create policy "public reads site images" on storage.objects for select to public using (bucket_id = 'site-images');

alter table public.profiles enable row level security;
alter table public.site_columns enable row level security;
alter table public.sites enable row level security;
alter table public.dashboard_screens enable row level security;
drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users" on public.profiles for select to authenticated using (true);
drop policy if exists "site columns readable by signed-in users" on public.site_columns;
create policy "site columns readable by signed-in users" on public.site_columns for select to authenticated using (true);
drop policy if exists "sites readable by signed-in users" on public.sites;
create policy "sites readable by signed-in users" on public.sites for select to authenticated using (true);
drop policy if exists "screens readable by signed-in users" on public.dashboard_screens;
create policy "screens readable by signed-in users" on public.dashboard_screens for select to authenticated using (true);
drop policy if exists "admins manage columns" on public.site_columns;
create policy "admins manage columns" on public.site_columns for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage sites" on public.sites;
create policy "admins manage sites" on public.sites for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage screens" on public.dashboard_screens;
create policy "admins manage screens" on public.dashboard_screens for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.site_columns (key,label,data_type,position) values
('serial_no','S.No','number',1),('project','Project Name','text',2),('state','State','text',3),('district','District','text',4),('site_name','Area / Site Name','text',5),('current_status','Current Status','text',6),('physical_progress','Physical Progress (%)','number',7),('remarks','Remarks','text',8),('site_photo','Site Photo (Link)','url',9),('last_updated','Last Updated','date',10)
on conflict (key) do update set label=excluded.label,data_type=excluded.data_type,position=excluded.position;

insert into public.sites (values) values
('{"serial_no":1,"project":"Highway Development Program","state":"Maharashtra","district":"Pune","site_name":"Ring Road Phase 2","current_status":"In Progress","physical_progress":45,"remarks":"Piling work completed, foundation ongoing","site_photo":"https://example.com/photos/site1.jpg","last_updated":"2026-09-15"}'),
('{"serial_no":2,"project":"Metro Rail Expansion","state":"Uttar Pradesh","district":"Lucknow","site_name":"Metro Extension - Sector 5","current_status":"Delayed","physical_progress":20,"remarks":"Delayed due to land acquisition issue","site_photo":"https://example.com/photos/site2.jpg","last_updated":"2026-09-10"}'),
('{"serial_no":3,"project":"Urban Infrastructure Upgrade","state":"Gujarat","district":"Surat","site_name":"Flyover Junction A","current_status":"Completed","physical_progress":100,"remarks":"Handed over to municipal authority","site_photo":"https://example.com/photos/site3.jpg","last_updated":"2026-09-01"}');

-- Development credentials requested for v1. Change both immediately after first use.
-- The ordinary username `User` maps to user@kiipl.local in the login form.
do $$
declare admin_id uuid := '11111111-1111-4111-8111-111111111111'; viewer_id uuid := '22222222-2222-4222-8222-222222222222';
begin
  insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values (admin_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@kiipl.com',crypt('adminkiipl',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
         (viewer_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','user@kiipl.local',crypt('kiipl',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now())
  on conflict (id) do nothing;
  insert into auth.identities (id,user_id,identity_data,provider,provider_id,created_at,updated_at)
  values (gen_random_uuid(),admin_id,jsonb_build_object('sub',admin_id::text,'email','admin@kiipl.com'),'email','admin@kiipl.com',now(),now()),
         (gen_random_uuid(),viewer_id,jsonb_build_object('sub',viewer_id::text,'email','user@kiipl.local'),'email','user@kiipl.local',now(),now())
  on conflict (provider_id,provider) do nothing;
  insert into public.profiles (id,display_name,role) values (admin_id,'Admin','admin'),(viewer_id,'User','viewer') on conflict (id) do update set display_name=excluded.display_name,role=excluded.role;
end $$;

-- Auth repair / compatibility. GoTrue requires these token fields to be empty
-- strings rather than NULL for manually seeded password users. Keeping this in
-- the setup script also repairs users created by an earlier run of this file.
update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    reauthentication_token = coalesce(reauthentication_token, '')
where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

-- Rebuild only the two seed identities to avoid collisions from an older script.
delete from auth.identities
where provider = 'email' and (user_id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222') or provider_id in ('admin@kiipl.com','user@kiipl.local','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'));
insert into auth.identities (id,user_id,identity_data,provider,provider_id,created_at,updated_at) values
(gen_random_uuid(),'11111111-1111-4111-8111-111111111111',jsonb_build_object('sub','11111111-1111-4111-8111-111111111111','email','admin@kiipl.com'),'email','11111111-1111-4111-8111-111111111111',now(),now()),
(gen_random_uuid(),'22222222-2222-4222-8222-222222222222',jsonb_build_object('sub','22222222-2222-4222-8222-222222222222','email','user@kiipl.local'),'email','22222222-2222-4222-8222-222222222222',now(),now());
