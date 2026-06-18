"""
OCR çekirdek: bytes → {okunan_plaka, ham_metin, guvenilirlik}.

Akış:
  1. OpenCV ile plaka konturunu bul ve kırp (yoksa tüm görselle devam).
  2. EasyOCR ile karakter oku.
  3. TR plaka regex'leriyle metni temizle, normalize et.

EasyOCR Reader uygulama açılışında tek sefer yüklenir (model ~64 MB).
GPU=False — TR plakası kısa string, CPU yeterli ve Railway'de GPU yok.
"""

from __future__ import annotations

import re
from typing import Optional

import cv2
import easyocr
import numpy as np


# Modül seviyesinde tek instance — Flask worker başına bir kez yüklenir
_reader: Optional[easyocr.Reader] = None


def get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _reader


# TR plaka pattern'leri — boşluklu da yakalansın
_PLAKA_REGEXES = [
    re.compile(r"\b(\d{2}\s?[A-Z]{1,3}\s?\d{1,4})\b"),
    re.compile(r"\bTEST\s?\d{1,4}\b", re.IGNORECASE),
]


def _normalize(s: str) -> str:
    return re.sub(r"[\s\-_.]", "", s).upper().strip()


def _plaka_kirp(img: np.ndarray) -> Optional[np.ndarray]:
    """OpenCV ile plaka konturu bul ve kırpılmış görseli döndür.

    Bulamazsa None — caller tüm görseli OCR'a verebilir (fallback).
    """
    if img is None or img.size == 0:
        return None

    gri = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    bulanik = cv2.bilateralFilter(gri, 11, 17, 17)
    kenar = cv2.Canny(bulanik, 30, 200)

    konturlar, _ = cv2.findContours(kenar, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    konturlar = sorted(konturlar, key=cv2.contourArea, reverse=True)[:15]

    h_img, w_img = img.shape[:2]
    min_alan = h_img * w_img * 0.005
    max_alan = h_img * w_img * 0.30

    for k in konturlar:
        alan = cv2.contourArea(k)
        if alan < min_alan or alan > max_alan:
            continue
        cevre = cv2.arcLength(k, True)
        yakl = cv2.approxPolyDP(k, 0.018 * cevre, True)
        if len(yakl) == 4:
            x, y, w, h = cv2.boundingRect(yakl)
            oran = w / h if h > 0 else 0
            if 2.5 <= oran <= 6:
                # +5px padding (kenarları kırpmayalım)
                pad = 5
                y0 = max(0, y - pad)
                x0 = max(0, x - pad)
                y1 = min(h_img, y + h + pad)
                x1 = min(w_img, x + w + pad)
                return img[y0:y1, x0:x1]
    return None


def plaka_oku(img_bytes: bytes) -> dict:
    """Ana fonksiyon: image bytes → OCR sonucu dict.

    Dönüş şeması:
      {ok, okunan_plaka?, ham_metin, guvenilirlik, hata_kodu?}
    """
    img_array = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        return {
            "ok": False,
            "okunan_plaka": None,
            "ham_metin": "",
            "guvenilirlik": 0.0,
            "hata_kodu": "GORSEL_OKUNAMADI",
        }

    plaka_img = _plaka_kirp(img)
    if plaka_img is None:
        # Fallback: tüm görseli OCR'a ver
        plaka_img = img

    reader = get_reader()
    sonuclar = reader.readtext(plaka_img, detail=1, paragraph=False)

    if not sonuclar:
        return {
            "ok": True,
            "okunan_plaka": None,
            "ham_metin": "",
            "guvenilirlik": 0.0,
            "hata_kodu": "OCR_BOS_DONDU",
        }

    ham_metin = " ".join(s[1] for s in sonuclar).strip()
    ortalama_conf = sum(s[2] for s in sonuclar) / len(sonuclar)

    # Regex ile plaka çıkar
    plaka: Optional[str] = None
    for re_obj in _PLAKA_REGEXES:
        m = re_obj.search(ham_metin)
        if m:
            plaka = _normalize(m.group(0))
            break

    # Regex tutmadı: tüm metni normalize edip plakaymış gibi al (5-12 karakter)
    if not plaka:
        plaka_aday = _normalize(ham_metin)
        if 5 <= len(plaka_aday) <= 12:
            plaka = plaka_aday

    if not plaka:
        return {
            "ok": True,
            "okunan_plaka": None,
            "ham_metin": ham_metin,
            "guvenilirlik": round(ortalama_conf, 2),
            "hata_kodu": "PLAKA_TESPIT_EDILEMEDI",
        }

    return {
        "ok": True,
        "okunan_plaka": plaka,
        "ham_metin": ham_metin,
        "guvenilirlik": round(ortalama_conf, 2),
    }
