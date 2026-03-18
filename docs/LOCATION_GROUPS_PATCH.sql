create extension if not exists pgcrypto;

create table if not exists public.lokasyon_gruplari (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id) on delete cascade,
  ad text not null,
  aciklama text,
  aktif boolean not null default true,
  kayit_tarihi timestamptz not null default now(),
  guncelleme_tarihi timestamptz not null default now(),
  kayit_yapan_id uuid references public.users(id),
  unique (firma_id, ad)
);

create table if not exists public.lokasyon_grup_uyeleri (
  id uuid primary key default gen_random_uuid(),
  grup_id uuid not null references public.lokasyon_gruplari(id) on delete cascade,
  lokasyon_id uuid not null references public.lokasyonlar(id) on delete cascade,
  kayit_tarihi timestamptz not null default now(),
  unique (grup_id, lokasyon_id)
);

create index if not exists idx_lokasyon_gruplari_firma on public.lokasyon_gruplari(firma_id);
create index if not exists idx_lokasyon_grup_uyeleri_grup on public.lokasyon_grup_uyeleri(grup_id);
create index if not exists idx_lokasyon_grup_uyeleri_lokasyon on public.lokasyon_grup_uyeleri(lokasyon_id);


alter table if exists public.lokasyon_gruplari
  add column if not exists ust_lokasyon_id uuid references public.lokasyonlar(id) on delete set null;

create index if not exists idx_lokasyon_gruplari_ust_lokasyon on public.lokasyon_gruplari(ust_lokasyon_id);
