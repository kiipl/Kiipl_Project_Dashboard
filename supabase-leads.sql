-- KIIPL Lead Engine: run after supabase.sql in the Supabase SQL Editor. Idempotent.
create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',          -- facebook, instagram, linkedin, twitter, apify, webhook, ai_extract, manual
  source_ref text,                                 -- id of the lead / comment / profile at the source
  full_name text,
  email text,
  phone text,                                      -- E.164 (+919876543210)
  company text,
  title text,
  location text,
  language text not null default 'en-IN',          -- BCP-47, used for email copy and the calling agent
  profile_url text,
  notes text,
  raw jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','contacted','booked','called','qualified','disqualified','unsubscribed')),
  email_step integer not null default 0,           -- how many outreach emails have been sent
  last_emailed_at timestamptz,
  call_attempts integer not null default 0,
  last_called_at timestamptz,
  score integer,
  qualification jsonb,
  qualified_at timestamptz,
  synced_to_sheet_at timestamptz,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists leads_email_key on public.leads (lower(email)) where email is not null;
create unique index if not exists leads_phone_key on public.leads (phone) where phone is not null;
create unique index if not exists leads_source_ref_key on public.leads (source, source_ref) where source_ref is not null;
create index if not exists leads_status_idx on public.leads (status);

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at before update on public.leads for each row execute procedure public.touch_updated_at();

-- Timeline of everything that happened to a lead (captured, emailed, booked, called, qualified, synced...).
create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_events_lead_idx on public.lead_events (lead_id, created_at desc);

create table if not exists public.lead_appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  calendar_event_id text,
  meet_link text,
  booked_via text not null default 'email',        -- email, call, admin
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  created_at timestamptz not null default now()
);
create index if not exists lead_appointments_lead_idx on public.lead_appointments (lead_id);

create table if not exists public.lead_calls (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  twilio_sid text unique,
  language text not null,
  status text not null default 'queued',
  transcript jsonb not null default '[]'::jsonb,   -- [{role:"agent"|"lead", text, language, at}]
  silent_turns integer not null default 0,
  summary text,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists lead_calls_lead_idx on public.lead_calls (lead_id, created_at desc);

-- Admins can see and manage everything from the dashboard. Webhooks, cron and the
-- calling agent use the service-role key on the server, which bypasses RLS.
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.lead_appointments enable row level security;
alter table public.lead_calls enable row level security;
drop policy if exists "admins manage leads" on public.leads;
create policy "admins manage leads" on public.leads for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage lead events" on public.lead_events;
create policy "admins manage lead events" on public.lead_events for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage lead appointments" on public.lead_appointments;
create policy "admins manage lead appointments" on public.lead_appointments for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage lead calls" on public.lead_calls;
create policy "admins manage lead calls" on public.lead_calls for all to authenticated using (public.is_admin()) with check (public.is_admin());
