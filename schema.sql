-- ============================================================
-- MedCert online — Supabase schema
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- It is safe to run more than once.
--
-- BEFORE YOU RUN IT: change the ONE e-mail address in the last INSERT
-- (near the bottom) to the ADMIN's e-mail. The admin then adds all other
-- staff from the Users tab inside the system.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Who is allowed to use the system ----------
create table if not exists staff_emails (
  email text primary key
);
alter table staff_emails add column if not exists role text not null default 'staff';
alter table staff_emails enable row level security;   -- no policies = nobody can read it directly

create or replace function is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from staff_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from staff_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'admin'
  );
$$;
revoke all on function is_admin() from public;
grant execute on function is_admin() to authenticated;

-- ---------- Settings (one row) ----------
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into settings (id, data) values (1, jsonb_build_object(
  'logo1', null, 'logo2', null, 'logo1Size', 70, 'logo2Size', 55,
  'orgName', 'Island Garden City of Samal',
  'orgSubtitle', 'Province of Davao del Norte.',
  'officeLine', 'Office of the Super Health Center Babak',
  'cityProvince', 'Island Garden City of Samal, Davao del Norte',
  'closingVenue', 'Babak Super Health Center of Island Garden City of Samal',
  'footerAddress', 'Purok 6, Barangay Miranda, Babak District, Island Garden City of Samal, 8119, Davao del Norte Province, 0927-318-2432',
  'footerEmail', '',
  'footerTagline', '"Towards A Healthy IGACOS"',
  'controlPrefix', 'IGACOS-BABAK',
  'qrEnabled', true
)) on conflict (id) do nothing;

-- ---------- Physicians ----------
create table if not exists physicians (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text,
  license text,
  ptr text,
  created_at timestamptz not null default now()
);

-- ---------- Patients (for autofill) ----------
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists patients_name_idx on patients (lower(name));

-- ---------- Certificates ----------
create table if not exists control_counters (
  year int primary key,
  last_value int not null default 0
);
alter table control_counters enable row level security;

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  control_number text unique,                                  -- set by trigger, e.g. IGACOS-BABAK-2026-000001
  verify_token text unique not null default encode(gen_random_bytes(12), 'hex'),  -- unguessable; goes in the QR
  status text not null default 'valid' check (status in ('valid', 'cancelled')),
  patient_name text not null,
  data jsonb not null default '{}'::jsonb,                     -- every other certificate field
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists certificates_name_idx on certificates (lower(patient_name));
create index if not exists certificates_created_idx on certificates (created_at desc);

-- Sequential control number, per calendar year (Philippine time), assigned by
-- the database so it cannot be skipped, reused or backdated from the browser.
create or replace function assign_control_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  yr int := extract(year from (now() at time zone 'Asia/Manila'))::int;
  nxt int;
  prefix text;
begin
  insert into control_counters (year, last_value) values (yr, 1)
  on conflict (year) do update set last_value = control_counters.last_value + 1
  returning last_value into nxt;

  select coalesce(nullif(data ->> 'controlPrefix', ''), 'MEDCERT') into prefix from settings where id = 1;
  new.control_number := prefix || '-' || yr || '-' || lpad(nxt::text, 6, '0');
  return new;
end $$;

drop trigger if exists trg_assign_control_number on certificates;
create trigger trg_assign_control_number before insert on certificates
  for each row execute function assign_control_number();

-- The control number and QR token can never change after creation.
create or replace function protect_certificate_identity() returns trigger
language plpgsql as $$
begin
  new.control_number := old.control_number;
  new.verify_token := old.verify_token;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_protect_certificate_identity on certificates;
create trigger trg_protect_certificate_identity before update on certificates
  for each row execute function protect_certificate_identity();

-- ---------- Row Level Security: staff only ----------
alter table settings     enable row level security;
alter table physicians   enable row level security;
alter table patients     enable row level security;
alter table certificates enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings', 'physicians', 'patients', 'certificates'] loop
    execute format('drop policy if exists staff_all on %I', t);
    execute format('create policy staff_all on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

-- ---------- Public verification (what the QR code opens) ----------
-- Anyone holding the QR token can confirm a certificate is genuine. It returns
-- ONLY who/when/which doctor — never age, address, diagnosis or remarks.
create or replace function verify_certificate(p_token text) returns jsonb
language sql security definer stable set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
        'found', true,
        'status', c.status,
        'control_number', c.control_number,
        'patient_name', c.patient_name,
        'date_examined', c.data ->> 'dateExamined',
        'issued_day', c.data ->> 'dateIssuedDay',
        'issued_month', c.data ->> 'dateIssuedMonth',
        'issued_year', c.data ->> 'dateIssuedYear',
        'physician', c.data ->> 'physicianName',
        'physician_title', c.data ->> 'physicianTitle',
        'license', c.data ->> 'physicianLicense',
        'issuer', s.data ->> 'orgName',
        'office', s.data ->> 'officeLine'
      )
      from certificates c cross join settings s
      where c.verify_token = p_token and s.id = 1
      limit 1),
    jsonb_build_object('found', false)
  );
$$;

revoke all on function verify_certificate(text) from public;
grant execute on function verify_certificate(text) to anon, authenticated;

-- ---------- The ADMIN (EDIT THIS E-MAIL, then run) ----------
insert into staff_emails (email, role) values
  (lower('your-email@example.com'), 'admin')
on conflict (email) do update set role = 'admin';

-- ---------- Permissions for logged-in staff ----------
-- Newer Supabase projects do not give the "authenticated" role access to new
-- tables automatically, so it is granted here. (Row Level Security above still
-- decides WHO may use it: staff only.) control_counters and staff_emails are
-- deliberately NOT granted: only the database itself touches them.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on settings, physicians, patients, certificates to authenticated;
grant execute on function is_staff() to authenticated;

-- The manage-users Edge Function runs as service_role and needs the staff list.
grant usage on schema public to service_role;
grant all on staff_emails to service_role;
