
create table if not exists personel_mesai_kayitlari (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references users(id) on delete cascade,
 proje_id uuid references projeler(id) on delete cascade,
 giris_saati timestamptz,
 cikis_saati timestamptz,
 giris_tipi text,
 cikis_tipi text,
 kayit_tarihi date default current_date,
 created_at timestamptz default now()
);
