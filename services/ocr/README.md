# Plaka OCR Servisi (Python + EasyOCR)

Oto Yıkama modülünün plaka okuma backend servisi. Mobil cihazdan gelen plaka
fotoğrafını OpenCV ile kırpıp EasyOCR ile karakter okur ve plaka stringini
döndürür. Asıl tüketici Next.js endpoint'i: `/api/app/oto-yikama/plaka-ocr`
(bu repo'da `app/api/app/oto-yikama/plaka-ocr/route.ts`).

## Mimari

- **Ayrı Railway servisi** olarak çalışır (Next.js servisinden bağımsız image).
- Next.js servisi bu servisi `OCR_SERVIS_URL` env değişkeniyle çağırır
  (Railway private network → `http://ocr.railway.internal:5000/oku` benzeri).
- Boot'ta EasyOCR İngilizce modeli yüklenir (~64 MB, Docker build aşamasında
  indirilir; runtime'da network gerekmez).

## Endpoint'ler

| Method | Path     | Açıklama |
|--------|----------|----------|
| GET    | `/health` | Liveness probe → `{ok: true, servis: "plaka-ocr"}` |
| POST   | `/oku`    | Multipart `file` alır, OCR sonucu döner |

`/oku` cevap şeması:
```json
{
  "ok": true,
  "okunan_plaka": "16BGB710" | null,
  "ham_metin": "16BGB 710 TR",
  "guvenilirlik": 0.92,
  "hata_kodu": "PLAKA_TESPIT_EDILEMEDI" | "OCR_BOS_DONDU" | null
}
```

## Lokal çalıştırma

```bash
cd services/ocr
docker build -t iogys-ocr .
docker run --rm -p 5000:5000 iogys-ocr
# Test:
curl -F "file=@./test_plaka.jpg" http://localhost:5000/oku
```

## Railway deploy

1. Railway projesinde **+ New Service** → **GitHub repo** → bu repo'yu seç
2. **Settings → Root Directory** = `services/ocr`
3. **Settings → Build/Deploy** otomatik `railway.json` ile alınır (Dockerfile builder)
4. Servis adı `ocr` koyulursa Next.js tarafı `OCR_SERVIS_URL=http://ocr.railway.internal:5000/oku`
   ile private network üzerinden çağırır
5. Health check `/health` ile beklenir (60sn timeout — ilk boot'ta model load)

## Performans

- Cold start: ~3-5sn (model load Docker build'de yapıldığı için kısa)
- İstek başına: ~700-1200ms (OpenCV kırpma + EasyOCR + regex)
- RAM: idle ~350 MB, peak ~600 MB
- 1 worker / 2 thread → ~2 paralel istek; sahada Atalian peak'i karşılar
