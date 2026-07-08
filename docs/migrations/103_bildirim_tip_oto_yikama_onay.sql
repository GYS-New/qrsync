-- Migration 103: bildirim_tip enum'una 'oto_yikama_onay' ekle
--
-- Sebep: onay-bekleyen tanimsiz plaka yikamalari icin amire bildirim
-- gonderiyoruz (POST /api/app/oto-yikama/tanimsiz-baslat icinde bildirimler
-- INSERT edilir). Ancak tip='oto_yikama_onay' enum'da olmadigi icin INSERT
-- sessizce fail oluyordu (try/catch icinde). Amir GYS zilinde bir sey
-- gormuyordu.
--
-- Not: ALTER TYPE ADD VALUE transaction icinde calismayabilir (Postgres 12+
-- destekler); Supabase editor'de tek satir olarak calisir.

ALTER TYPE bildirim_tip ADD VALUE IF NOT EXISTS 'oto_yikama_onay';
