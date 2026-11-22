create table public.arbres (
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
  lng double precision not null,
  lat double precision not null,
  statut text not null default 'attente' check (statut in ('attente','valide','rejete'))
);

alter table public.arbres enable row level security;

create policy "lecture publique des arbres valides"
  on public.arbres for select
  using (statut = 'valide');

create policy "proposition publique d'un arbre"
  on public.arbres for insert
  with check (statut = 'attente');
