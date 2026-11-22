-- Olivemap : base Supabase
-- Script idempotent : peut être ré-exécuté sans erreur (répare policies, droits et schéma).

-- ============================================================
-- 1) Table des arbres
-- ============================================================
create table if not exists public.arbres (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  nom text not null,
  type text not null default 'particulier' check (type in ('mairie','particulier')),
  production int not null default 2 check (production between 1 and 3),
  espece text,
  hauteur_m numeric,
  circonference_cm numeric,
  annee_plantation int,
  etat text,
  photo text,
  notes text,
  kids_friendly boolean not null default false,
  acces_pieton boolean not null default false,
  ramassage timestamptz,
  lng double precision not null,
  lat double precision not null,
  statut text not null default 'attente' check (statut in ('attente','valide','rejete'))
);

alter table public.arbres
  add column if not exists kids_friendly boolean not null default false,
  add column if not exists acces_pieton boolean not null default false,
  add column if not exists ramassage timestamptz;

-- ============================================================
-- 2) Table des administrateurs (emails autorisés)
-- ============================================================
create table if not exists public.admins (
  email text primary key
);

-- ============================================================
-- 3) Fonction is_admin() : evite la récursion RLS sur admins
-- ============================================================
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$
  select auth.jwt() ->> 'email' in (select email from public.admins);
$$;

-- ============================================================
-- 4) Droits SQL (les policies RLS filtrent ensuite les lignes)
-- ============================================================
grant select, insert on public.arbres to anon;
grant select, insert, update, delete on public.arbres to authenticated;
grant select, insert, delete on public.admins to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ============================================================
-- 5) Sécurité RLS — arbres
-- ============================================================
alter table public.arbres enable row level security;

drop policy if exists "lecture publique des arbres valides" on public.arbres;
drop policy if exists "proposition publique d'un arbre" on public.arbres;

create policy "lecture des arbres valides ou par un admin"
  on public.arbres for select
  using (statut = 'valide' or public.is_admin());

create policy "proposition publique sans date de ramassage"
  on public.arbres for insert
  with check (statut = 'attente' and ramassage is null);

create policy "un admin met à jour les arbres"
  on public.arbres for update
  using (public.is_admin()) with check (public.is_admin());

create policy "un admin supprime les arbres"
  on public.arbres for delete
  using (public.is_admin());

-- ============================================================
-- 6) Sécurité RLS — admins
-- ============================================================
alter table public.admins enable row level security;

drop policy if exists "admins consultent la liste" on public.admins;
drop policy if exists "un admin ajoute un admin" on public.admins;
drop policy if exists "un admin retire un autre admin" on public.admins;

create policy "admins consultent la liste"
  on public.admins for select
  using (public.is_admin());

create policy "un admin ajoute un admin"
  on public.admins for insert
  to authenticated
  with check (public.is_admin());

create policy "un admin retire un autre admin"
  on public.admins for delete
  using (public.is_admin() and email <> auth.jwt() ->> 'email');

-- ============================================================
-- 7) PREMIER ADMIN — indispensable !
-- Remplace l'email ci-dessous par le tien (celui avec lequel
-- tu te connecteras), puis exécute.
-- ============================================================
-- Le mot de passe se règle dans Dashboard → Authentication → Users → Add user,
-- avec l'email système : ton-pseudo@olivemap.claret
-- insert into public.admins (email) values ('ton-pseudo@olivemap.claret')
--   on conflict (email) do nothing;

-- Vérification : doit lister les policies en place
select tablename, policyname, cmd from pg_policies
  where schemaname = 'public' and tablename in ('arbres', 'admins');

-- ============================================================
-- 8) PARTICIPATIONS AUX CUEILLETTES (« Je viens »)
-- ============================================================
create table if not exists public.participations (
  id bigint generated always as identity primary key,
  arbre_id bigint not null references public.arbres (id) on delete cascade,
  pseudo text not null,
  nb_personnes int not null default 1 check (nb_personnes between 1 and 50),
  cree_le timestamptz not null default now()
);
alter table public.participations enable row level security;

drop policy if exists "lecture publique des participations" on public.participations;
create policy "lecture publique des participations"
  on public.participations for select
  using (true);

drop policy if exists "n'importe qui peut participer" on public.participations;
create policy "n'importe qui peut participer"
  on public.participations for insert
  to anon, authenticated
  with check (true);

drop policy if exists "les admins gerent les participations" on public.participations;
create policy "les admins gerent les participations"
  on public.participations for delete
  using (public.is_admin());

grant select, insert on public.participations to anon, authenticated;
grant delete on public.participations to authenticated;
