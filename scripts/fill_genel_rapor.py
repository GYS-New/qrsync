#!/usr/bin/env python3
"""
QR-SYNC Genel Rapor Excel Doldurma Scripti
Şablonu koruyarak gerçek verilerle doldurur.
Grafikler, stiller ve merge yapısı korunur.
"""
import sys, json, copy
from openpyxl import load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

# Yardımcı stiller — fonksiyon içi import karışıklığını önlemek için en üstte
_thin_side = Side(border_style='thin')
_data_border_global = Border(top=_thin_side, bottom=_thin_side, left=_thin_side, right=_thin_side)
_no_border_global = Border()

def write(ws, row, col, value, align='left'):
    """Merge-aware hücre yazma: merge anchor'a unmerge→write→remerge yapar."""
    # Bu hücreyi içeren merge aralığını bul (anchor mı değil mi)
    merge_range = None
    for m in list(ws.merged_cells.ranges):
        if m.min_row == row and m.min_col == col:
            merge_range = str(m)
            break
    if merge_range:
        ws.unmerge_cells(merge_range)
    cell = ws.cell(row=row, column=col)
    cell.value = value
    try:
        cell.alignment = Alignment(horizontal=align, vertical='center', wrap_text=True)
    except Exception:
        pass
    if merge_range:
        ws.merge_cells(merge_range)

def copy_row_style(ws, src_row, dst_row, max_col=12):
    """Kaynak satırın stili ve format'ını hedef satıra kopyalar."""
    for col in range(1, max_col + 1):
        src_cell = ws.cell(row=src_row, column=col)
        dst_cell = ws.cell(row=dst_row, column=col)
        if src_cell.has_style:
            dst_cell.font      = copy.copy(src_cell.font)
            dst_cell.fill      = copy.copy(src_cell.fill)
            dst_cell.border    = copy.copy(src_cell.border)
            dst_cell.alignment = copy.copy(src_cell.alignment)
            dst_cell.number_format = src_cell.number_format
    # Satır yüksekliği kopyala
    if src_row in ws.row_dimensions:
        src_h = ws.row_dimensions[src_row].height
        if src_h:
            ws.row_dimensions[dst_row].height = src_h

def fill_table_sheet(ws, rows_data, col_writers, total_label_cell='C3', total_value=None):
    """
    Tamamlanan/Sapmalar gibi detay sheet'lerini doldurur.
    col_writers: list of (col_idx, key) pairs
    Template'deki satır 4-8 arasını şablon olarak kullanır, gerektiğinde genişletir.
    """
    TEMPLATE_START = 4
    TEMPLATE_END   = 8  # şablondaki son örnek satır

    n = len(rows_data)

    # Eğer veri sayısı template satırlarından fazlaysa yeni satırlar ekle
    if n > (TEMPLATE_END - TEMPLATE_START + 1):
        extra = n - (TEMPLATE_END - TEMPLATE_START + 1)
        # insert_rows after template_end
        ws.insert_rows(TEMPLATE_END + 1, extra)
        # yeni satırlara stil kopyala
        for i in range(extra):
            copy_row_style(ws, TEMPLATE_START, TEMPLATE_END + 1 + i)

    # Tüm data satırlarını temizle ve yaz
    last_data_row = TEMPLATE_START + max(n - 1, TEMPLATE_END - TEMPLATE_START)
    for r in range(TEMPLATE_START, last_data_row + 1):
        for c in range(1, 8):
            ws.cell(row=r, column=c).value = None

    for i, row_data in enumerate(rows_data):
        r = TEMPLATE_START + i
        ws.cell(row=r, column=1).value = row_data.get('sn', i + 1)
        for col_idx, key in col_writers:
            ws.cell(row=r, column=col_idx).value = row_data.get(key, '')

def fill_kayip_sheet(ws, rows_data):
    """
    Kayıp Frekanslar sayfasını doldurur.
    Sütunlar: SN(1), LOKASYON(2), GÖREV NO(3), GÖREV TANIMI(4), TARİH-SAAT(5), DURUM(6)
    Template satır 4-8 arası şablon satırı.
    """
    TEMPLATE_START = 4
    TEMPLATE_END   = 8
    n = len(rows_data)

    if n > (TEMPLATE_END - TEMPLATE_START + 1):
        extra = n - (TEMPLATE_END - TEMPLATE_START + 1)
        ws.insert_rows(TEMPLATE_END + 1, extra)
        for i in range(extra):
            copy_row_style(ws, TEMPLATE_START, TEMPLATE_END + 1 + i, max_col=6)

    last_data_row = TEMPLATE_START + max(n - 1, TEMPLATE_END - TEMPLATE_START)
    for r in range(TEMPLATE_START, last_data_row + 1):
        for col in range(1, 7):
            ws.cell(row=r, column=col).value = None

    for i, row_data in enumerate(rows_data):
        r = TEMPLATE_START + i
        ws.cell(row=r, column=1).value = row_data.get('sn', i + 1)
        ws.cell(row=r, column=2).value = row_data.get('lokasyon', '')
        ws.cell(row=r, column=3).value = row_data.get('gorevNo', '')
        ws.cell(row=r, column=4).value = row_data.get('gorevTanimi', '')
        ws.cell(row=r, column=5).value = row_data.get('tarihSaat', '')
        ws.cell(row=r, column=6).value = row_data.get('durum', '')

def main():
    if len(sys.argv) != 4:
        print("Kullanim: fill_genel_rapor.py <template.xlsx> <payload.json> <output.xlsx>", file=sys.stderr)
        sys.exit(1)

    template_path, payload_path, output_path = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(payload_path, 'r', encoding='utf-8') as f:
        d = json.load(f)

    wb = load_workbook(template_path)

    gruplar          = d.get('grupMetrikleri', [])
    toplam           = d.get('toplamGorev', 0)
    toplamTam        = d.get('toplamTamamlanan', 0)
    toplamSap        = d.get('toplamSapma', 0)
    toplamKay        = d.get('toplamKayip', 0)
    genelBasari      = d.get('genelBasari', 0)
    gunSayisi        = d.get('gunSayisi', 1)
    toplamGerceklesen = toplamTam + toplamSap

    # Hedef = grupların gfs×gunSayisi toplamı (tüm FREKANS GÖSTERGELERİ tablolarında kullanılır)
    # Hedef = TÜM görevler (duruma bakılmaz) — grupların hedef toplamı
    toplamHedef = sum(g.get('hedef', 0) for g in gruplar)
    if toplamHedef == 0:
        toplamHedef = toplam  # fallback (toplam = toplamGorev)

    # ══ GİRİŞ SAYFASI ══════════════════════════════════════════
    ws = wb['Giriş']

    # PARAMETRELER — G(7) sütunu merge başlangıçları
    write(ws, 2, 7, d.get('firmaAdi', ''))
    write(ws, 3, 7, d.get('ustLokTanim', ''))
    write(ws, 4, 7, d.get('altLokTanim', ''))
    write(ws, 5, 7, d.get('raporTarihLabel', ''))
    write(ws, 6, 7, f"{gunSayisi} gün")
    write(ws, 7, 7, d.get('raporuAlan', 'Yönetim'))

    # HAKEDİŞ FAKTÖRLERİ — AQ(43)=Grup, AV(48)=Hedef, BG(59)=Kayıp
    for i, g in enumerate(gruplar[:20]):
        r = 4 + i
        write(ws, r, 43, g.get('grup', ''))
        write(ws, r, 48, g.get('hedef', 0), 'center')
        write(ws, r, 59, g.get('kayip', 0), 'center')

    # GRUP FREKANS GÖSTERGELERİ — satır 14'ten
    # Gruplar sekmesiyle tam senkron: aynı değerler doğrudan yazılır
    # B(2)=grup, E(5)=hedef, H(8)=tamamlanan, K(11)=basariOrani%, O(15)=sapma, R(18)=kayip(DB), V(22)=genelOran
    n_grup = min(len(gruplar), 10)
    for i, g in enumerate(gruplar[:10]):
        r = 14 + i
        hedef_g    = g.get('hedef', 0)
        tam_g      = g.get('tamamlanan', 0)
        sap_g      = g.get('sapma', 0)
        # Kayıp: ZAMANI_GECMIS + IPTAL + SILINDI + BEKLEMEDE (DB'den)
        kayip_g    = g.get('kayip', 0)
        # Oranlar: hedef bazlı
        basari_g   = round(tam_g / hedef_g, 4) if hedef_g > 0 else 0
        genel_g    = round((tam_g + sap_g) / hedef_g, 4) if hedef_g > 0 else 0

        write(ws, r, 2,  g.get('grup', ''))
        write(ws, r, 5,  hedef_g,  'center')
        write(ws, r, 8,  tam_g,    'center')
        write(ws, r, 15, sap_g,    'center')

        # R(18) = Kayıp — DB'den gelen gerçek değer (formül değil)
        kayip_cell = ws.cell(row=r, column=18)
        kayip_cell.value = kayip_g
        kayip_cell.alignment = Alignment(horizontal='center', vertical='center')

        # K(11) = basariOrani — grafik bu hücreye bakıyor
        cell_k = ws.cell(row=r, column=11)
        cell_k.value = basari_g
        cell_k.number_format = '0.00%'
        try:
            cell_k.alignment = Alignment(horizontal='center', vertical='center')
        except: pass

        # V(22) = genelOran
        cell_v = ws.cell(row=r, column=22)
        cell_v.value = genel_g
        cell_v.number_format = '0.00%'

    # BAŞARILI İŞLEM ORANI grafiğini grup sayısına göre referans aralığını güncelle
    last_grup_row = 13 + n_grup  # satır 14'ten başlar
    # Grafik başlıkları — tablo adlarıyla eşleşmeli
    # Grafik index → beklenen başlık
    CHART_TITLES = {
        0: 'BAŞARILI İŞLEM ORANI',   # BarChart - grup başarı oranları
        2: 'FREKANS SAPMALARI',       # PieChart - sapma pasta
        3: 'GENEL DURUM',             # BarChart - genel durum
        4: 'KAYIP FREKANS GÖSTERGELERİ',  # PieChart - kayıp pasta
    }

    def set_chart_title(chart, text):
        """Grafik başlığını güncelle, font 22pt bold yap."""
        from openpyxl.drawing.text import CharacterProperties, ParagraphProperties
        try:
            for p in chart.title.tx.rich.p:
                if not p.pPr:
                    p.pPr = ParagraphProperties()
                if not p.pPr.defRPr:
                    p.pPr.defRPr = CharacterProperties()
                p.pPr.defRPr.sz = 1200  # 12pt = tablo başlığı ile aynı
                p.pPr.defRPr.b = True
                if p.r:
                    p.r[0].t = text
                    if not p.r[0].rPr:
                        p.r[0].rPr = CharacterProperties()
                    p.r[0].rPr.sz = 1200
                    p.r[0].rPr.b = True
                    del p.r[1:]
                    return True
        except Exception:
            pass
        return False

    for idx, chart in enumerate(ws._charts):
        # 1. BAŞARILI İŞLEM ORANI grafiğini güncelle (veri aralığı)
        if idx == 0:
            try:
                chart.series[0].val.numRef.f = f'Giriş!$K$14:$K${last_grup_row}'
                chart.series[0].cat.strRef.f  = f'Giriş!$B$14:$B${last_grup_row}'
            except Exception:
                pass
        # 2. Tüm grafiklerin başlıklarını tablo adlarıyla eşleştir
        if idx in CHART_TITLES:
            set_chart_title(chart, CHART_TITLES[idx])
        # 3. txPr içindeki 'None' string'lerini de temizle (Excel'de görünür)
        try:
            for p2 in chart.title.spPr.txPr.p:  # type: ignore
                if p2.r:
                    for run in p2.r:
                        if run.t == 'None':
                            run.t = CHART_TITLES.get(idx, '')
        except Exception:
            pass

    # FREKANS GÖSTERGELERİ — AA(27) etiket sütunu, AK(37) değer sütunu
    # Satır sırası: R12=Toplam, R13=Tamamlanmış, R14=Gerçekleşen(sayı), R15=Sapma, R16=Kayıp, R17=%Başarı
    # Gerçekleşen = Tamamlanan + Sapma (sayı olarak)
    toplamGerceklesen = toplamTam + toplamSap
    basari_pct = f'%{genelBasari}'
    frekans_vals = [toplamHedef, toplamTam, toplamGerceklesen, toplamSap, toplamKay, basari_pct]
    for i, val in enumerate(frekans_vals):
        write(ws, 12 + i, 37, val, 'center')

    # AZ(52): FREKANS SAPMALARI — Toplam / Sapma Sayısı / Sapma Oranı
    sapma_orani = round(toplamSap / toplamHedef * 100) if toplamHedef > 0 else 0
    for i, val in enumerate([toplamHedef, toplamSap, f'%{sapma_orani}']):
        write(ws, 12 + i, 52, val, 'center')

    # BN(66): KAYIP FREKANS GÖSTERGELERİ — Toplam / Kayıp Sayısı / Kayıp Oranı
    kayip_orani = round(toplamKay / toplamHedef * 100) if toplamHedef > 0 else 0
    for i, val in enumerate([toplamHedef, toplamKay, f'%{kayip_orani}']):
        write(ws, 12 + i, 66, val, 'center')

    # ══ TAMAMLANAN FREKANSLAR ══════════════════════════════════
    ws_tam = wb['Tamamlanan Frekanslar']
    rows_tam = d.get('tamamlananGorevler', [])
    fill_table_sheet(
        ws_tam, rows_tam,
        col_writers=[(2,'personel'),(3,'lokasyon'),(4,'gorevNo'),(5,'gorevTanimi'),(6,'tarihSaat'),(7,'durum')]
    )

    # ══ SAPMALAR ══════════════════════════════════════════════
    ws_sap = wb['Sapmalar']
    rows_sap = d.get('sapmaGorevler', [])
    fill_table_sheet(
        ws_sap, rows_sap,
        col_writers=[(2,'personel'),(3,'lokasyon'),(4,'gorevNo'),(5,'gorevTanimi'),(6,'tarihSaat'),(7,'sapmaNedeni')]
    )

    # ══ GRUPLAR ══════════════════════════════════════════════
    ws_gr = wb['Gruplar']
    n_gr = len(gruplar)

    # SUM formülleri - yeni kolon yapısı (D=GÖREV TANIMI eklendi, diğerleri +1)
    data_end = max(n_gr + 2, 3)
    ws_gr.cell(row=2, column=4).value  = None                         # D: GÖREV TANIMI - toplam yok
    ws_gr.cell(row=2, column=5).value  = f'=SUM(E3:E{data_end})'     # E: Günlük Frekans
    ws_gr.cell(row=2, column=6).value  = f'=SUM(F3:F{data_end})'     # F: Hedef
    ws_gr.cell(row=2, column=7).value  = f'=SUM(G3:G{data_end})'     # G: Tamamlanan
    ws_gr.cell(row=2, column=8).value  = f'=SUM(H3:H{data_end})'     # H: Sapma
    ws_gr.cell(row=2, column=9).value  = f'=SUM(I3:I{data_end})'     # I: Kayıp (gerçek toplam)
    cell_j2 = ws_gr.cell(row=2, column=10)
    cell_j2.value = '=IF(F2>0,G2/F2,0)'                              # J: Başarı Oranı
    cell_j2.number_format = '0%'
    cell_k2 = ws_gr.cell(row=2, column=11)
    cell_k2.value = '=IF(F2>0,(G2+H2)/F2,0)'                         # K: Genel Oran
    cell_k2.number_format = '0%'

    # Veri satırlarını temizle + border sıfırla (bozuk satır görünümünü önle)
    clear_end = max(n_gr + 3, 10)
    for r in range(3, clear_end):
        for col in range(1, 12):
            ws_gr.cell(row=r, column=col).value = None
            ws_gr.cell(row=r, column=col).border = _no_border_global

    def pct_to_float(s):
        try: return float(str(s).replace('%','').replace(',','.') or 0) / 100.0
        except: return 0.0

    for i, g in enumerate(gruplar):
        r = 3 + i
        # Tüm veri satırı hücrelerine border uygula (C4 dahil)
        for col in range(1, 12):
            ws_gr.cell(row=r, column=col).border = _data_border_global
        hedef_val     = g.get('hedef', 0)
        tamamlanan_val = g.get('tamamlanan', 0)
        sapma_val     = g.get('sapma', 0)
        ws_gr.cell(row=r, column=1).value  = i + 1
        ws_gr.cell(row=r, column=2).value  = g.get('grup', '')
        ws_gr.cell(row=r, column=3).value  = g.get('lokasyon', '')
        ws_gr.cell(row=r, column=4).value  = g.get('gorevTanimi', '')
        gunluk_fr = g.get('gunlukFrekans', 0)
        gun_sayisi_val = d.get('gunSayisi', 1)
        # Hedef = günlük frekans × rapor gün sayısı
        # Hedef = TÜM görevler (duruma bakılmaz) — DB'den gelen hedef_val kullan
        hedef_hesap = hedef_val
        ws_gr.cell(row=r, column=5).value  = gunluk_fr
        ws_gr.cell(row=r, column=6).value  = hedef_hesap
        # Kayıp: DB'den gelen gerçek değer — Kayıp Frekanslar sekmesiyle senkron
        kayip_db = g.get('kayip', 0)
        ws_gr.cell(row=r, column=7).value  = tamamlanan_val
        ws_gr.cell(row=r, column=8).value  = sapma_val
        ws_gr.cell(row=r, column=9).value  = kayip_db  # Kayıp (DB sayımı)
        # Oranlar: direkt değer yaz (formül yerine)
        basari_val = round(tamamlanan_val / hedef_hesap, 4) if hedef_hesap > 0 else 0
        genel_val  = round((tamamlanan_val + sapma_val) / hedef_hesap, 4) if hedef_hesap > 0 else 0
        cell_j = ws_gr.cell(row=r, column=10)
        cell_j.value = basari_val
        cell_j.number_format = '0.00%'
        cell_k = ws_gr.cell(row=r, column=11)
        cell_k.value = genel_val
        cell_k.number_format = '0.00%'

    # ══ KAYIP FREKANSLAR ══════════════════════════════════════════
    ws_kayip = wb['Kayıp Frekanslar']
    rows_kayip = d.get('kayipGorevler', [])
    fill_kayip_sheet(ws_kayip, rows_kayip)

    wb.save(output_path)
    print("OK")

if __name__ == '__main__':
    main()
