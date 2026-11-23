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
drop policy if exists "lecture des arbres valides ou par un admin" on public.arbres;
drop policy if exists "proposition publique sans date de ramassage" on public.arbres;
drop policy if exists "creation d'arbres valides par les admins" on public.arbres;
drop policy if exists "un admin met à jour les arbres" on public.arbres;
drop policy if exists "un admin supprime les arbres" on public.arbres;

create policy "lecture des arbres valides ou par un admin"
  on public.arbres for select
  using (statut = 'valide' or public.is_admin());

create policy "proposition publique sans date de ramassage"
  on public.arbres for insert
  with check (
    statut = 'attente' and ramassage is null
    and lat between 43.83 and 43.90
    and lng between 3.86 and 3.95
  );

create policy "creation d'arbres valides par les admins"
  on public.arbres for insert
  with check (public.is_admin());

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
  arbre_id uuid not null references public.arbres (id) on delete cascade,
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

-- ============================================================
-- 9) PHOTOS : bucket public + upload réservé aux admins
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('photos', 'photos', true)
  on conflict (id) do nothing;

drop policy if exists "photos lecture publique" on storage.objects;
create policy "photos lecture publique"
  on storage.objects for select
  using (bucket_id = 'photos');

drop policy if exists "photos upload admin" on storage.objects;
create policy "photos upload admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'photos' and public.is_admin());

-- ============================================================
-- 10) CUEILLETTE EN 2 JOURS : jour par arbre + matériel + annonce
--     (ré-exécutable : idempotent)
-- ============================================================
alter table public.arbres
  add column if not exists jour smallint,
  add column if not exists besoin_echelle boolean,
  add column if not exists besoin_caisses boolean,
  add column if not exists besoin_rateau boolean,
  add column if not exists besoin_bache boolean,
  add column if not exists ramasse boolean;
create table if not exists public.infos (
  id uuid primary key default gen_random_uuid(),
  cle text unique not null,
  valeur text not null,
  maj_le timestamptz default now()
);
alter table public.infos enable row level security;

drop policy if exists "lecture publique des infos" on public.infos;
drop policy if exists "admins modifient les infos" on public.infos;

create policy "lecture publique des infos"
  on public.infos for select
  using (true);

create policy "admins modifient les infos"
  on public.infos for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.infos to anon, authenticated;
grant insert, update, delete on public.infos to authenticated;

alter table public.participations add column if not exists apporte text;

-- ============================================================
-- 11) POINTS LOGISTIQUES DÉDIÉS : table « pois » séparée
--     (lecture publique, écriture réservée aux admins)
-- ============================================================
create table if not exists public.pois (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  lng double precision not null,
  lat double precision not null,
  cree_le timestamptz not null default now()
);
alter table public.pois enable row level security;

drop policy if exists "lecture publique des pois" on public.pois;
create policy "lecture publique des pois"
  on public.pois for select
  using (true);

drop policy if exists "admins gèrent les pois" on public.pois;
create policy "admins gèrent les pois"
  on public.pois for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.pois to anon, authenticated;
grant insert, update, delete on public.pois to authenticated;

-- Reprise des anciens points logistiques stockés dans « arbres » (si la colonne existe encore)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'arbres' and column_name = 'poi'
  ) then
    insert into public.pois (type, lat, lng)
    select a.poi, a.lat, a.lng from public.arbres a
    where a.poi is not null
      and not exists (
        select 1 from public.pois p
        where p.type = a.poi and p.lat = a.lat and p.lng = a.lng
      );
  end if;
end $$;

-- Les points logistiques ne vivent plus dans la table arbres :
alter table public.arbres drop column if exists poi;

-- ============================================================
-- 12) JOURS DE CUEILLETTE N : table « jours »
--     (les dates vivent sur les jours, plus sur les arbres)
-- ============================================================
create table if not exists public.jours (
  numero smallint primary key,
  date date
);
alter table public.jours enable row level security;

drop policy if exists "lecture publique des jours" on public.jours;
create policy "lecture publique des jours"
  on public.jours for select
  using (true);

drop policy if exists "admins gèrent les jours" on public.jours;
create policy "admins gèrent les jours"
  on public.jours for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.jours to anon, authenticated;
grant insert, update, delete on public.jours to authenticated;

-- Jours 1 et 2 par défaut + reprise des dates stockées dans « infos »
insert into public.jours (numero)
  select s.n from unnest(array[1, 2]) as s(n)
  on conflict (numero) do nothing;

update public.jours set date = nullif((select valeur from public.infos where cle = 'jour1'), '')
  where numero = 1 and date is null;
update public.jours set date = nullif((select valeur from public.infos where cle = 'jour2'), '')
  where numero = 2 and date is null;

-- La date ne vit plus sur l'arbre :
alter table public.arbres drop column if exists ramassage;
