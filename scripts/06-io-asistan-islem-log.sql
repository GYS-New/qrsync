-- İO Asistan yazma işlemleri için audit log
create table if not exists io_asistan_islem_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id) on delete set null,
  firma_id      uuid,
  proje_id      uuid,
  islem_tipi    text not null,                      -- 'gorev_olustur' | 'gorev_guncelle' | 'gorev_iptal' vs.
  hedef_tablo   text,                               -- 'gorevler' | 'canli_gorevler' | ...
  hedef_id      uuid,                               -- oluşturulan/değiştirilen kaydın id'si
  input         jsonb,                              -- kullanıcının verdiği parametreler
  sonuc         text not null,                      -- 'basarili' | 'yetki_yok' | 'hata'
  mesaj         text,                               -- özet mesaj
  kayit_tarihi  timestamptz not null default now()
);

create index if not exists idx_io_islem_log_user on io_asistan_islem_log(user_id);
create index if not exists idx_io_islem_log_firma on io_asistan_islem_log(firma_id);
create index if not exists idx_io_islem_log_tarih on io_asistan_islem_log(kayit_tarihi desc);
