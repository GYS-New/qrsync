"""
fill_qr_kart.py — QR Kart Şablon Doldurucu
Kullanım: python3 fill_qr_kart.py <sablon_path> <payload_json_path> <cikti_zip_path>

Payload JSON:
{
  "lokasyonlar": [{"id":"...","tanim":"BAYAN WC'LER","qr_url":"https://..."}],
  "ayarlar": {
    "qr_x": 190, "qr_y": 415, "qr_w": 100, "qr_h": 110,
    "metin_x": 290, "metin_y": 255,
    "balon_genislik": 200,
    "font_boyut": 24
  }
}
"""

import sys, os, json, zipfile, io, re

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("HATA: pip install pillow", file=sys.stderr); sys.exit(1)
try:
    import qrcode
except ImportError:
    print("HATA: pip install qrcode", file=sys.stderr); sys.exit(1)


# ── FONT YÜKLEYİCİ ─────────────────────────────────────────────────────────
def _load_font(size: int) -> ImageFont.FreeTypeFont:
    """
    Inter Bold öncelikli arar.
    Windows: Fonts klasörü + AppData + script yanı
    Linux:   /usr/share/fonts altı
    Fallback: Arial Bold → DejaVu Bold
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))

    candidates = [
        # Script yanına koyulan font (en güvenilir)
        os.path.join(script_dir, 'Inter-Bold.ttf'),
        os.path.join(script_dir, 'InterBold.ttf'),

        # Windows sistem fontları
        r'C:\Windows\Fonts\Inter-Bold.ttf',
        r'C:\Windows\Fonts\InterBold.ttf',
        r'C:\Windows\Fonts\Inter_Bold.ttf',
        os.path.expanduser(r'~\AppData\Local\Microsoft\Windows\Fonts\Inter-Bold.ttf'),
        os.path.expanduser(r'~\AppData\Local\Microsoft\Windows\Fonts\InterBold.ttf'),

        # Linux / macOS
        '/usr/share/fonts/truetype/inter/Inter-Bold.ttf',
        '/usr/local/share/fonts/Inter-Bold.ttf',
        os.path.expanduser('~/.fonts/Inter-Bold.ttf'),

        # Fallback'ler
        r'C:\Windows\Fonts\arialbd.ttf',       # Arial Bold (Windows)
        r'C:\Windows\Fonts\calibrib.ttf',       # Calibri Bold (Windows)
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    ]

    for path in candidates:
        try:
            f = ImageFont.truetype(path, size)
            print(f"Font: {os.path.basename(path)} ({size}px)", flush=True)
            return f
        except (IOError, OSError):
            continue

    print(f"UYARI: Inter Bold bulunamadı, varsayılan font kullanılıyor.", file=sys.stderr)
    return ImageFont.load_default()


# ── PİKSEL BAZLI METİN SARMA ───────────────────────────────────────────────
def wrap_by_pixel(text: str, font: ImageFont.FreeTypeFont, max_px: int) -> str:
    """
    Metni piksel genişliğine göre satırlara böl.
    textwrap.fill'in aksine gerçek render genişliğini ölçer.
    """
    words = text.split()
    lines = []
    current = ''

    for word in words:
        test = (current + ' ' + word).strip()
        try:
            bbox = font.getbbox(test)
            w = bbox[2] - bbox[0]
        except AttributeError:
            # Eski Pillow versiyonları için
            w = font.getlength(test)  # type: ignore
        if w <= max_px:
            current = test
        else:
            if current:
                lines.append(current)
            current = word

    if current:
        lines.append(current)

    return '\n'.join(lines) if lines else text


# ── MİNİMAL QR KART (şablonsuz) ───────────────────────────────────────────
def build_minimal_kart(lok: dict, boyut: int = 320) -> Image.Image:
    """Şablon olmadan: beyaz arka plan, QR kodu, altında lokasyon adı."""
    import qrcode as _qr

    qr = _qr.QRCode(version=None, error_correction=_qr.constants.ERROR_CORRECT_M, box_size=10, border=1)
    qr.add_data(lok.get('qr_url', ''))
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color='black', back_color='white').convert('RGB')
    qr_img = qr_img.resize((boyut, boyut), Image.LANCZOS)

    font_boyut = max(16, boyut // 14)
    font = _load_font(font_boyut)
    metin = str(lok.get('tanim', '')).upper()
    try:
        bbox = font.getbbox(metin)
        txt_w = bbox[2] - bbox[0]
    except AttributeError:
        txt_w = len(metin) * font_boyut * 0.6

    padding = 16
    txt_h = font_boyut + 8
    toplam_h = boyut + padding + txt_h + padding

    kart = Image.new('RGB', (boyut + padding * 2, toplam_h), 'white')
    kart.paste(qr_img, (padding, padding))

    draw = ImageDraw.Draw(kart)
    x = (boyut + padding * 2) // 2
    y = boyut + padding + txt_h // 2
    wrapped = wrap_by_pixel(metin, font, boyut)
    draw.multiline_text((x, y), wrapped, fill='black', font=font, align='center', anchor='mm', spacing=4)
    return kart


# ── QR GÖRSEL ÜRETİCİ ──────────────────────────────────────────────────────
def generate_qr_image(url: str, size: tuple) -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=1,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color='black', back_color='white').convert('RGBA')
    return img.resize(size, Image.LANCZOS)


# ── KART ÜRETİCİ ───────────────────────────────────────────────────────────
def build_kart(sablon: Image.Image, lok: dict, ayarlar: dict) -> Image.Image:
    kart = sablon.copy()

    # ── QR KOD ──
    qr_x = ayarlar.get('qr_x', 190)
    qr_y = ayarlar.get('qr_y', 415)
    qr_w = ayarlar.get('qr_w', 100)
    qr_h = ayarlar.get('qr_h', 110)

    qr_url = lok.get('qr_url', '')
    if qr_url:
        qr_img = generate_qr_image(qr_url, (qr_w, qr_h))
        if kart.mode != 'RGBA':
            kart = kart.convert('RGBA')
        kart.paste(qr_img, (qr_x, qr_y), qr_img)

    # ── LOKASYON ADI ──
    metin_x      = ayarlar.get('metin_x', 290)
    metin_y      = ayarlar.get('metin_y', 255)
    font_boyut   = ayarlar.get('font_boyut', 24)
    balon_px     = ayarlar.get('balon_genislik', 200)  # balonun kullanılabilir piksel genişliği

    metin = str(lok.get('tanim', '')).upper()
    font  = _load_font(font_boyut)

    # Piksel bazlı sarma
    parcali = wrap_by_pixel(metin, font, balon_px)

    draw = ImageDraw.Draw(kart)
    draw.multiline_text(
        (metin_x, metin_y),
        parcali,
        fill='black',
        font=font,
        align='center',
        anchor='mm',
        spacing=6,
    )

    return kart.convert('RGB')


# ── YARDIMCI ───────────────────────────────────────────────────────────────
def safe_filename(text: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', '-', text).strip('-').replace(' ', '_') or 'kart'


# ── ANA FONKSİYON ──────────────────────────────────────────────────────────
def main():
    if len(sys.argv) != 4:
        print(f"Kullanım: python3 {sys.argv[0]} <sablon.png|-> <payload.json> <cikti.zip>",
              file=sys.stderr)
        sys.exit(1)

    # sablon_path '-' veya boş string ise minimal mod (QR + isim, beyaz arka plan)
    sablon_path  = sys.argv[1] if sys.argv[1] != '-' else ''
    payload_path = sys.argv[2]
    cikti_path   = sys.argv[3]

    minimal_mod = not sablon_path or sablon_path.strip() == ''
    sablon = None
    if not minimal_mod:
        if not os.path.exists(sablon_path):
            print(f"HATA: Şablon bulunamadı: {sablon_path}", file=sys.stderr)
            sys.exit(1)
        sablon = Image.open(sablon_path).convert('RGBA')

    with open(payload_path, 'r', encoding='utf-8') as f:
        payload = json.load(f)

    lokasyonlar = payload.get('lokasyonlar', [])
    ayarlar     = payload.get('ayarlar', {})

    if not lokasyonlar:
        print("HATA: Lokasyon verisi boş", file=sys.stderr)
        sys.exit(1)

    basarili = hata = 0

    with zipfile.ZipFile(cikti_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for i, lok in enumerate(lokasyonlar):
            try:
                if minimal_mod:
                    kart = build_minimal_kart(lok, ayarlar.get('minimal_boyut', 320))
                else:
                    kart = build_kart(sablon, lok, ayarlar)
                buf = io.BytesIO()
                kart.save(buf, format='PNG', optimize=True)
                buf.seek(0)
                dosya_adi = safe_filename(lok.get('tanim', f'lokasyon_{i+1}')) + '.png'
                zf.writestr(f"qr-kartlar/{dosya_adi}", buf.read())
                basarili += 1
                print(f"OK: {lok.get('tanim','')}", flush=True)
            except Exception as e:
                hata += 1
                print(f"HATA [{lok.get('tanim','?')}]: {e}", file=sys.stderr)

        zf.writestr('qr-kartlar/OKUYUN.txt',
            f"QR Kart Paketi\nBaşarılı: {basarili}\nHata: {hata}\n\n"
            "Inter Bold font kullanımı için:\n"
            "Inter-Bold.ttf dosyasını scripts/ klasörüne koyun.\n"
            "İndir: https://fonts.google.com/specimen/Inter\n")

    print(f"TAMAM: {basarili} kart, {hata} hata.", flush=True)


if __name__ == '__main__':
    main()
