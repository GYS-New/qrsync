-- Migration 114: pdks_kullanilan_tokenlar PK (token_hash) → (token_hash, user_id)
--
-- KURAL DEGISIKLIGI (a) → (b):
--   Onceki: token_hash PRIMARY KEY — ayni token'i HERKES icin tek kullanim
--           Sonuc: kapi seri, 40 kisilik vardiya ~20 dakika sirada bekliyor
--
--   Yeni:   (token_hash, user_id) PRIMARY KEY — (token, kullanici) cifti tek
--           Sonuc: farkli personel ayni kodu okutabilir (kapi paralel akar,
--                  vardiya basi ~2 dk); ayni personel ayni kodu ikinci kez
--                  okutamaz (yanlislikla giris/cikis kazasi engellenir).
--
-- Guvenlik dengesi: kod bir gruba sizarsa 30 sn icinde birden fazla kisi
-- kullanabilir (eskiden tek kisi kullanabiliyordu). Kompanse etmek icin
-- PDKS_PENCERE_SANIYE 30 → 15 saniyeye dusuruluyor (Railway env), sizan
-- kodun omru yariya iner.

TRUNCATE public.pdks_kullanilan_tokenlar;

ALTER TABLE public.pdks_kullanilan_tokenlar DROP CONSTRAINT pdks_kullanilan_tokenlar_pkey;

ALTER TABLE public.pdks_kullanilan_tokenlar
  ADD CONSTRAINT pdks_kullanilan_tokenlar_pkey PRIMARY KEY (token_hash, user_id);

COMMENT ON TABLE public.pdks_kullanilan_tokenlar IS
  'Kullanilmis rotasyon token hashleri (kural b): (token, user_id) cifti basina tek kullanim.';
