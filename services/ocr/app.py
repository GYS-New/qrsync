"""
Flask uygulaması — Oto Yıkama Plaka OCR servisi.

Endpoint'ler:
  GET  /health → {ok: true, servis: "plaka-ocr"}
  POST /oku    → multipart 'file' alır → ocr.plaka_oku() sonucu döner

Üretimde gunicorn ile koşar (Procfile / Dockerfile CMD).
EasyOCR modeli ilk istek değil app boot'unda yüklenir → cold start tek seferlik.
"""

from __future__ import annotations

import os

from flask import Flask, jsonify, request

from ocr import get_reader, plaka_oku

MAX_DOSYA_BYTES = 5 * 1024 * 1024

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_DOSYA_BYTES + 1024  # küçük tampon

# Boot'ta modeli ısıt — ilk gerçek istek hızlı olsun
get_reader()


@app.get("/health")
def health():
    return jsonify({"ok": True, "servis": "plaka-ocr"})


@app.post("/oku")
def oku():
    if "file" not in request.files:
        return jsonify({"ok": False, "hata_kodu": "DOSYA_YOK"}), 400

    file = request.files["file"]
    img_bytes = file.read()
    if not img_bytes:
        return jsonify({"ok": False, "hata_kodu": "DOSYA_YOK"}), 400
    if len(img_bytes) > MAX_DOSYA_BYTES:
        return jsonify({"ok": False, "hata_kodu": "DOSYA_BOYUTU_ASILDI"}), 400

    try:
        sonuc = plaka_oku(img_bytes)
    except Exception as e:  # pylint: disable=broad-except
        return jsonify({"ok": False, "hata_kodu": "INTERNAL_OCR_HATASI", "hata": str(e)}), 500

    return jsonify(sonuc)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
