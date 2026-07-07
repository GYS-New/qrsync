'use client'

import { useEffect, useMemo, useState } from 'react'
import { Users, MapPin, Server, Database, Bot, Globe, Infinity as InfinityIcon, Calculator, Info, TrendingUp, Building2, FolderKanban, Loader2, AlertCircle, Package, Car, Wrench, AudioLines } from 'lucide-react'

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#059669', greenLight: '#d1fae5',
  amber: '#d97706', amberLight: '#fef3c7',
  purple: '#7c3aed', purpleLight: '#ede9fe',
  red: '#dc2626', redLight: '#fee2e2',
  slate: '#475569', slateLight: '#f1f5f9',
  cardBg: '#ffffff',
}

const KDV_ORAN = 0.20
const FIYAT_KULLANICI = 20       // TL / kullanıcı / ay
const FIYAT_LOKASYON = 80        // TL / lokasyon / ay

// Sabit maliyet kalemleri — GYS Fiyat.xlsx baseline (300 kullanıcı, 1500 gorev/gun kapasite)
type SabitKalem = {
  ad: string
  ikon: React.ReactNode
  kapasite: string
  aciklama: string
  tutar: number
}
const SABIT_KALEMLER: SabitKalem[] = [
  {
    ad: 'Sunucu Aylık Kira Bedeli',
    ikon: <Server size={16} color={T.blue} />,
    kapasite: '300 kullanıcı · 1.500 görev/gün · 4 GB ön bellek',
    aciklama: '0-300 kullanıcı aktivitesi, 0-3.000 günlük veri işleme kapasitesi',
    tutar: 7650,
  },
  {
    ad: 'Veritabanı Aylık Kira Bedeli',
    ikon: <Database size={16} color={T.purple} />,
    kapasite: '8 GB SSD depolama',
    aciklama: 'Kapasiteye göre 1 yıllık veri depolama',
    tutar: 3916,
  },
  {
    ad: 'Yapay Zeka Modeli Aylık Kira Bedeli',
    ikon: <Bot size={16} color={T.green} />,
    kapasite: '300 kullanıcı · 1.500 görev/gün',
    aciklama: 'Kapasiteye göre anlık izleme',
    tutar: 5300,
  },
  {
    ad: 'İşletme Maliyeti',
    ikon: <Globe size={16} color={T.amber} />,
    kapasite: '300 user aktivite · 1.500 görev/gün',
    aciklama: 'Genel işletme ve web yazılım geliştirme',
    tutar: 16750,
  },
]
const SABIT_TOPLAM = SABIT_KALEMLER.reduce((s, k) => s + k.tutar, 0) // 33.616 TL

// Sinirsiz kullanim odeme esigi kirilimi — daha buyuk kapasite icin
const ESIK_KALEMLER: SabitKalem[] = [
  {
    ad: 'Sunucu Aylık Kira Bedeli',
    ikon: <Server size={16} color={T.blue} />,
    kapasite: '2.000 kullanıcı · 10.000 görev/gün · 16 GB bellek',
    aciklama: '2.000 kullanıcı aktivitesi, 20.000 üzeri veri işleme kapasitesi',
    tutar: 38560,
  },
  {
    ad: 'Veritabanı Aylık Kira Bedeli',
    ikon: <Database size={16} color={T.purple} />,
    kapasite: '32 GB SSD depolama',
    aciklama: '1 yıllık veri depolama',
    tutar: 22350,
  },
  {
    ad: 'Yapay Zeka Modeli Aylık Kira Bedeli',
    ikon: <Bot size={16} color={T.green} />,
    kapasite: '2.000 kullanıcı · 10.000 görev/gün',
    aciklama: 'Kapasiteye göre anlık izleme',
    tutar: 12840,
  },
  {
    ad: 'İşletme Maliyeti',
    ikon: <Globe size={16} color={T.amber} />,
    kapasite: '2.000 kullanıcı · 10.000 görev/gün',
    aciklama: 'Personel, izleme, geliştirme ve yönetim',
    tutar: 190750,
  },
]
const SINIRSIZ_ESIK = ESIK_KALEMLER.reduce((s, k) => s + k.tutar, 0) // 264.500 TL

function fmtTL(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + ' ₺'
}

type FirmaAnaliziProje = {
  id: string
  ad: string
  aktif: boolean
  kullanici_sayisi: number
  lokasyon_sayisi: number
}

type FirmaAnaliziResp = {
  ok: true
  firma: { id: string; ad: string }
  projeler: FirmaAnaliziProje[]
  firmaToplam: { kullanici: number; lokasyon: number; projeSayisi: number }
}

interface Props {
  firmaId: string | null
}

export default function UcretlendirmePolitikasiClient({ firmaId }: Props) {
  const [tab, setTab] = useState<'politika' | 'analiz' | 'moduller'>('politika')

  // ─── SEKME 1: Hesap makinesi (proje bazli) girdileri ──────────────────
  const [kullaniciSayisi, setKullaniciSayisi] = useState<number>(0)
  const [lokasyonSayisi, setLokasyonSayisi] = useState<number>(0)

  // ─── Firma analizi verisi — her iki sekme icin de gerekli ───────────
  // Sekme 1: firma toplamlari sabit maliyet payini hesaplamak icin.
  // Sekme 2: proje bazli maliyet analizi tablosu.
  // Firma degistigi anda sekmeden bagimsiz yenilenir.
  const [analiz, setAnaliz] = useState<FirmaAnaliziResp | null>(null)
  const [analizLoading, setAnalizLoading] = useState(false)
  const [analizHata, setAnalizHata] = useState<string | null>(null)

  useEffect(() => {
    if (!firmaId) { setAnaliz(null); return }
    let iptal = false
    ;(async () => {
      setAnalizLoading(true)
      setAnalizHata(null)
      try {
        const res = await fetch(`/api/sa/ucretlendirme/firma-analizi?firma_id=${firmaId}`, { cache: 'no-store' })
        const j = await res.json()
        if (iptal) return
        if (!j.ok) throw new Error(j.error ?? 'Analiz verisi alınamadı')
        setAnaliz(j as FirmaAnaliziResp)
      } catch (e: any) {
        if (!iptal) setAnalizHata(e?.message ?? 'Bilinmeyen hata')
      } finally {
        if (!iptal) setAnalizLoading(false)
      }
    })()
    return () => { iptal = true }
  }, [firmaId])

  // Sabit maliyet payi hesabi — Firma Analizi verisinden firma toplamini alir
  const hesap = useMemo(() => {
    const u = Math.max(0, kullaniciSayisi || 0)
    const l = Math.max(0, lokasyonSayisi || 0)
    const fu = analiz?.firmaToplam.kullanici ?? 0
    const fl = analiz?.firmaToplam.lokasyon ?? 0
    // Senaryo: Lokasyon yok ise (l=0), her kullanici QR-siz calisir ve
    // kullanici basi birim fiyat KULLANICI + LOKASYON birim fiyatlari toplami
    // (20 + 80 = 100 TL) olarak alinir. Lokasyon >= 1 ise normal hesap.
    const kullaniciBirim = l === 0 ? FIYAT_KULLANICI + FIYAT_LOKASYON : FIYAT_KULLANICI
    const kullaniciMaliyeti = u * kullaniciBirim
    const lokasyonMaliyeti = l * FIYAT_LOKASYON
    const projeDegisken = kullaniciMaliyeti + lokasyonMaliyeti
    // Sabit maliyet payi: 'yeni eklenecek proje' senaryosu.
    // Girilen proje henuz firmaya eklenmedi varsayilir; sabit pay,
    // projenin firmanin YENI (mevcut + girilen) toplam degiskeni icindeki
    // agirligina gore hesaplanir:
    //   pay = SABIT × (projeDegisken / (firmaMevcutDegisken + projeDegisken))
    const firmaMevcutDegisken = fu * FIYAT_KULLANICI + fl * FIYAT_LOKASYON
    const firmaYeniDegisken = firmaMevcutDegisken + projeDegisken
    const sabitPayOran = firmaYeniDegisken > 0 ? projeDegisken / firmaYeniDegisken : 0
    const sabitPay = SABIT_TOPLAM * sabitPayOran
    const firmaDegisken = firmaMevcutDegisken // geri uyum icin
    const kdvHaric = projeDegisken + sabitPay
    const kdv = kdvHaric * KDV_ORAN
    const kdvDahil = kdvHaric + kdv
    return {
      u, l, fu, fl,
      kullaniciBirim,
      kullaniciMaliyeti, lokasyonMaliyeti, projeDegisken,
      firmaDegisken, sabitPayOran, sabitPay,
      kdvHaric, kdv, kdvDahil,
    }
  }, [kullaniciSayisi, lokasyonSayisi, analiz])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
      {/* SEKME ÇUBUĞU */}
      <div style={{
        display: 'flex', gap: 4, borderBottom: `2px solid ${T.border}`,
        paddingBottom: 0, marginBottom: 4,
      }}>
        <TabBtn active={tab === 'politika'} onClick={() => setTab('politika')} icon={<TrendingUp size={16} />}>
          Genel Politika
        </TabBtn>
        <TabBtn active={tab === 'analiz'} onClick={() => setTab('analiz')} icon={<FolderKanban size={16} />}>
          Firma Analizi
        </TabBtn>
        <TabBtn active={tab === 'moduller'} onClick={() => setTab('moduller')} icon={<Package size={16} />}>
          Özel Modüller
        </TabBtn>
      </div>

      {tab === 'politika' && (<>
      {/* HERO */}
      <div style={{
        background: `linear-gradient(135deg, ${T.blue} 0%, ${T.purple} 100%)`,
        borderRadius: 16, padding: '28px 32px', color: '#fff',
        boxShadow: '0 12px 30px -8px rgba(29, 78, 216, 0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <TrendingUp size={28} />
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em' }}>
            GYS Ücretlendirme Politikası
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, opacity: 0.95 }}>
          Görev Yönetim Sistemi (GYS) ücretlendirme yapısı; <strong>sabit altyapı maliyetleri</strong> ile
          <strong> kullanıcı ve lokasyon (QR) başına değişken bileşenlerden</strong> oluşur.
          Rakamlar KDV hariçtir. Nihai fiyat her projenin ihtiyacına, kapasite ve destek
          seviyesine göre farklılık gösterir.
        </p>
      </div>

      {/* DEĞİŞKEN BİRİM FİYATLAR */}
      <div>
        <SectionTitle icon={<Users size={18} color={T.slate} />}>Değişken Birim Fiyatlar</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          <BirimKart
            ikon={<Users size={26} color="#fff" />}
            renk={T.blue}
            baslik="Kullanıcı Başına"
            fiyat={FIYAT_KULLANICI}
            aciklama="Aktif kullanıcı hesabı başına aylık"
          />
          <BirimKart
            ikon={<MapPin size={26} color="#fff" />}
            renk={T.purple}
            baslik="Lokasyon (QR) Başına"
            fiyat={FIYAT_LOKASYON}
            aciklama="Sistemde tanımlı her lokasyon QR'ı için aylık"
          />
        </div>
      </div>

      {/* SABİT MALİYETLER TABLOSU */}
      <div>
        <SectionTitle icon={<Server size={18} color={T.slate} />}>Sabit Altyapı ve İşletme Maliyetleri</SectionTitle>
        <div style={{
          background: T.blueLight, border: `1px solid ${T.blue}`, borderRadius: 12,
          padding: '14px 18px', marginBottom: 12, display: 'flex', gap: 12,
          alignItems: 'flex-start', fontSize: 15, color: '#1e3a8a', lineHeight: 1.55,
        }}>
          <Building2 size={20} color={T.blue} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            Aşağıdaki sabit maliyet <strong>firma seviyesindedir</strong> — bir firma için
            <strong> tek bir kez</strong> ödenir ve firmanın tüm projelerine paylaştırılır. Proje bazlı
            hesapta bu maliyet, firmanın toplam proje sayısına bölünerek her projeye adil bir pay olarak yansıtılır.
          </div>
        </div>
        <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ background: T.slate, color: '#fff' }}>
                <Th style={{ width: 50 }}>#</Th>
                <Th>Kalem</Th>
                <Th>Kapasite / Özellik</Th>
                <Th>Açıklama</Th>
                <Th align="right" style={{ width: 200 }}>Aylık Bedel (KDV Hariç)</Th>
              </tr>
            </thead>
            <tbody>
              {SABIT_KALEMLER.map((k, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : T.slateLight }}>
                  <Td align="center" muted>{i + 1}</Td>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {k.ikon}
                      <strong style={{ color: T.text, fontSize: 16 }}>{k.ad}</strong>
                    </div>
                  </Td>
                  <Td muted>{k.kapasite}</Td>
                  <Td muted small>{k.aciklama}</Td>
                  <Td align="right" mono bold style={{ fontSize: 16 }}>{fmtTL(k.tutar)}</Td>
                </tr>
              ))}
              <tr style={{ background: T.blueLight, borderTop: `3px solid ${T.blue}` }}>
                <Td colSpan={4} align="right" bold>
                  <span style={{ color: T.blue, fontSize: 15, letterSpacing: '0.03em' }}>SABİT MALİYET TOPLAMI</span>
                </Td>
                <Td align="right" mono bold style={{ color: T.blue, fontSize: 22 }}>
                  {fmtTL(SABIT_TOPLAM)}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ margin: '10px 4px 0', fontSize: 13.5, color: T.textSoft, fontStyle: 'italic' }}>
          * Sabit maliyetler; sunucu, veritabanı, yapay zeka altyapısı ve web platform işletmesi olmak üzere temel altyapıyı kapsar.
        </p>
      </div>

      {/* SINIRSIZ KULLANIM ÖDEME EŞİĞİ TABLOSU */}
      <div>
        <SectionTitle icon={<InfinityIcon size={18} color={T.slate} />}>Sınırsız Kullanım Ödeme Eşiği</SectionTitle>
        <div style={{
          background: T.greenLight, border: `1px solid ${T.green}`, borderRadius: 12,
          padding: '14px 18px', marginBottom: 12, display: 'flex', gap: 12,
          alignItems: 'flex-start', fontSize: 15, color: '#064e3b', lineHeight: 1.55,
        }}>
          <InfinityIcon size={22} color={T.green} style={{ flexShrink: 0, marginTop: 1 }} strokeWidth={2.4} />
          <div>
            Firma toplam aylık maliyeti bu eşiğin üzerine çıkarsa <strong>sınırsız kullanıcı ve
            lokasyon kullanımına uygun sunucu, altyapı, geliştirme ve yönetim destek
            hizmetleri</strong> devreye girer. Bu tavan <strong>firma genelidir</strong> — tüm projelerin
            toplam maliyeti dikkate alınır, tek proje bazlı değildir.
          </div>
        </div>
        <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ background: T.green, color: '#fff' }}>
                <Th style={{ width: 50 }}>#</Th>
                <Th>Kalem</Th>
                <Th>Kapasite / Özellik</Th>
                <Th>Açıklama</Th>
                <Th align="right" style={{ width: 200 }}>Aylık Bedel (KDV Hariç)</Th>
              </tr>
            </thead>
            <tbody>
              {ESIK_KALEMLER.map((k, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : T.slateLight }}>
                  <Td align="center" muted>{i + 1}</Td>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {k.ikon}
                      <strong style={{ color: T.text, fontSize: 16 }}>{k.ad}</strong>
                    </div>
                  </Td>
                  <Td muted>{k.kapasite}</Td>
                  <Td muted small>{k.aciklama}</Td>
                  <Td align="right" mono bold style={{ fontSize: 16 }}>{fmtTL(k.tutar)}</Td>
                </tr>
              ))}
              <tr style={{ background: T.greenLight, borderTop: `3px solid ${T.green}` }}>
                <Td colSpan={4} align="right" bold>
                  <span style={{ color: T.green, fontSize: 15, letterSpacing: '0.03em' }}>SINIRSIZ KULLANIM EŞİĞİ</span>
                </Td>
                <Td align="right" mono bold style={{ color: T.green, fontSize: 22 }}>
                  {fmtTL(SINIRSIZ_ESIK)}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ margin: '10px 4px 0', fontSize: 13.5, color: T.textSoft, fontStyle: 'italic' }}>
          * Ödeme eşiği; 2.000 aktif kullanıcı ve 10.000 günlük görev veri işleme kapasitesine göre boyutlandırılmıştır.
        </p>
      </div>

      {/* HESAP MAKİNESİ — proje bazli */}
      <div>
        <SectionTitle icon={<Calculator size={18} color={T.slate} />}>Proje Bazlı Aylık Maliyet Hesaplayıcı</SectionTitle>
        <div className="verde-card" style={{ padding: 24 }}>
          {/* Proje girdileri */}
          <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 800, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            ▸ Proje Bilgileri
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 13.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
                Proje Kullanıcı Sayısı
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={22} color={T.blue} />
                <input
                  type="number" min={0} value={kullaniciSayisi}
                  onChange={e => setKullaniciSayisi(parseInt(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
              <div style={{ fontSize: 14, color: T.textSoft, marginTop: 6 }}>
                × {fmtTL(hesap.kullaniciBirim)}
                {hesap.l === 0 && (
                  <span style={{ color: T.amber, fontWeight: 700, marginLeft: 4 }}>
                    (kul. + lok. — QR yok)
                  </span>
                )}
                {' = '}
                <strong style={{ color: T.blue, fontSize: 15 }}>{fmtTL(hesap.kullaniciMaliyeti)}</strong>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>
                Proje Lokasyon (QR) Sayısı
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MapPin size={22} color={T.purple} />
                <input
                  type="number" min={0} value={lokasyonSayisi}
                  onChange={e => setLokasyonSayisi(parseInt(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
              <div style={{ fontSize: 14, color: T.textSoft, marginTop: 6 }}>
                × {fmtTL(FIYAT_LOKASYON)} = <strong style={{ color: T.purple, fontSize: 15 }}>{fmtTL(hesap.lokasyonMaliyeti)}</strong>
              </div>
            </div>
          </div>

          {/* Firma toplami arka planda API'den otomatik alinir ve sabit pay
              hesabinda kullanilir — bilgi bandi UI'de gosterilmez. */}
          {firmaId && analizLoading && !analiz && (
            <div style={{
              background: T.slateLight, borderRadius: 10, padding: '12px 16px', marginBottom: 20,
              display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: T.textSoft,
            }}>
              <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
              Firma verisi yükleniyor…
            </div>
          )}
          {!firmaId && (
            <div style={{
              background: T.amberLight, border: `1px solid ${T.amber}`, borderRadius: 10,
              padding: '12px 16px', marginBottom: 20,
              display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, color: '#78350f',
            }}>
              <AlertCircle size={18} color={T.amber} />
              <div>Sabit maliyet payı hesaplamak için üst bardan bir firma seçin. Firma seçilmezse pay <strong>%0</strong> olarak hesaplanır.</div>
            </div>
          )}

          {/* Ozet tablo */}
          <div style={{ background: T.blueLight, borderRadius: 12, padding: 18, border: `1px solid ${T.blue}33` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 14, fontWeight: 800, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Calculator size={17} />
              Proje Aylık Maliyeti
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
              <tbody>
                <OzetSatir label="Kullanıcı Maliyeti" tutar={hesap.kullaniciMaliyeti} muted />
                <OzetSatir label="Lokasyon (QR) Maliyeti" tutar={hesap.lokasyonMaliyeti} muted />
                <OzetSatir label="Proje Değişken Ara Toplam" tutar={hesap.projeDegisken} border />
                <OzetSatir
                  label={`Sabit Maliyet Payı (%${(hesap.sabitPayOran * 100).toFixed(1)} × ${fmtTL(SABIT_TOPLAM)})`}
                  tutar={hesap.sabitPay}
                  muted
                />
                <OzetSatir label="AYLIK TOPLAM (KDV HARİÇ)" tutar={hesap.kdvHaric} bold highlight />
                <OzetSatir label={`KDV (%${KDV_ORAN * 100})`} tutar={hesap.kdv} muted />
                <OzetSatir label="AYLIK TOPLAM (KDV DAHİL)" tutar={hesap.kdvDahil} bold highlight2 />
              </tbody>
            </table>
          </div>

          <div style={{
            marginTop: 14, padding: '12px 16px', background: T.amberLight,
            border: `1px solid ${T.amber}`, borderRadius: 10,
            display: 'flex', gap: 10, alignItems: 'flex-start',
            fontSize: 13.5, color: '#78350f', lineHeight: 1.55,
          }}>
            <Info size={18} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Sabit maliyet payı formülü <strong>(yeni eklenecek proje senaryosu)</strong>:
              <br />
              <strong>SABİT × (proje değişkeni / (firma mevcut değişkeni + proje değişkeni))</strong>.
              <br />
              Girilen proje, seçili firmaya <strong>eklenecek bir proje</strong> varsayılarak firmanın
              güncellenmiş toplamı içindeki ağırlığına göre sabitten pay alır. Mevcut projelerin
              gerçek dağılımını görmek için <strong>Firma Analizi</strong> sekmesine geçin.
            </div>
          </div>
        </div>
      </div>

      {/* NOTLAR */}
      <div className="verde-card" style={{
        padding: 20, background: T.amberLight, border: `1px solid ${T.amber}`,
        display: 'flex', gap: 14, alignItems: 'flex-start',
      }}>
        <Info size={22} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 15, color: '#78350f', lineHeight: 1.65 }}>
          <strong style={{ display: 'block', marginBottom: 8, color: '#92400e', fontSize: 16 }}>Önemli Notlar</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Tüm fiyatlar Türk Lirası (₺) cinsinden, aylık ve KDV hariçtir. KDV oranı %{KDV_ORAN * 100}'dir.</li>
            <li><strong>Sabit maliyet firma seviyesinde tek ödenir</strong> — firmanın tüm projelerine paylaştırılır, her proje için ayrıca faturalanmaz.</li>
            <li>Yukarıdaki ücretlendirme her projenin ihtiyacına, kapasite ve destek seviyesine göre farklılık gösterir.</li>
            <li>Sınırsız kullanım eşiği <strong>firma toplam maliyeti</strong> üzerinden değerlendirilir; aşan firmalar için kullanıcı ve lokasyon bazlı ek ücret uygulanmaz, tavan tutar uygulanır.</li>
            <li>Özel entegrasyon, yeni modül geliştirme ve saha destek hizmetleri ayrıca fiyatlandırılır.</li>
          </ul>
        </div>
      </div>
      </>)}

      {tab === 'analiz' && (
        <FirmaAnaliziSekmesi
          firmaId={firmaId}
          analiz={analiz}
          loading={analizLoading}
          hata={analizHata}
        />
      )}

      {tab === 'moduller' && <OzelModullerSekmesi />}
    </div>
  )
}

// ─── SEKME 2: Firma Analizi ─────────────────────────────────────────────────

function FirmaAnaliziSekmesi({
  firmaId, analiz, loading, hata,
}: {
  firmaId: string | null
  analiz: FirmaAnaliziResp | null
  loading: boolean
  hata: string | null
}) {
  // Sabit maliyet paylasimi: her projenin (kullanici + lokasyon) unite payi
  // Aslinda yalniz adet toplami adil degil (lokasyon 4x maliyetli) — bu yuzden
  // "birim maliyet agirlikli" (kullanici×20 + lokasyon×80) oran kullanilir.
  const projelerHesap = useMemo(() => {
    if (!analiz) return []
    const firmaTopBirim = analiz.projeler.reduce(
      (s, p) => s + p.kullanici_sayisi * FIYAT_KULLANICI + p.lokasyon_sayisi * FIYAT_LOKASYON,
      0
    )
    return analiz.projeler.map(p => {
      const kulMaliyet = p.kullanici_sayisi * FIYAT_KULLANICI
      const lokMaliyet = p.lokasyon_sayisi * FIYAT_LOKASYON
      const degisken = kulMaliyet + lokMaliyet
      const sabitPayOran = firmaTopBirim > 0 ? degisken / firmaTopBirim : 0
      const sabitPay = SABIT_TOPLAM * sabitPayOran
      const kdvHaric = degisken + sabitPay
      const kdv = kdvHaric * KDV_ORAN
      const kdvDahil = kdvHaric + kdv
      return {
        ...p,
        kulMaliyet, lokMaliyet, degisken,
        sabitPayOran, sabitPay,
        kdvHaric, kdv, kdvDahil,
      }
    })
  }, [analiz])

  const firmaToplam = useMemo(() => {
    const t = projelerHesap.reduce((acc, p) => ({
      kullanici: acc.kullanici + p.kullanici_sayisi,
      lokasyon: acc.lokasyon + p.lokasyon_sayisi,
      kulMaliyet: acc.kulMaliyet + p.kulMaliyet,
      lokMaliyet: acc.lokMaliyet + p.lokMaliyet,
      degisken: acc.degisken + p.degisken,
      sabitPay: acc.sabitPay + p.sabitPay,
      kdvHaric: acc.kdvHaric + p.kdvHaric,
      kdv: acc.kdv + p.kdv,
      kdvDahil: acc.kdvDahil + p.kdvDahil,
    }), { kullanici: 0, lokasyon: 0, kulMaliyet: 0, lokMaliyet: 0, degisken: 0, sabitPay: 0, kdvHaric: 0, kdv: 0, kdvDahil: 0 })
    return t
  }, [projelerHesap])

  if (!firmaId) {
    return (
      <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: T.textSoft, fontSize: 15 }}>
        <Building2 size={40} color={T.border} style={{ marginBottom: 12 }} />
        <div>Analiz için üst bardan bir firma seçin.</div>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: T.textSoft, fontSize: 15 }}>
        <Loader2 size={28} className="animate-spin" style={{ animation: 'spin 0.8s linear infinite', marginBottom: 10 }} />
        <div>Firma analizi hazırlanıyor…</div>
      </div>
    )
  }
  if (hata) {
    return (
      <div className="verde-card" style={{ padding: 24, border: `1px solid ${T.red}`, background: T.redLight, color: '#7f1d1d', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <AlertCircle size={22} color={T.red} style={{ flexShrink: 0 }} />
        <div>
          <strong>Analiz yüklenemedi</strong>
          <div style={{ fontSize: 13.5, marginTop: 4 }}>{hata}</div>
        </div>
      </div>
    )
  }
  if (!analiz) return null

  return (
    <>
      {/* Firma özet kartı */}
      <div style={{
        background: `linear-gradient(135deg, ${T.blue} 0%, ${T.purple} 100%)`,
        borderRadius: 16, padding: '24px 28px', color: '#fff',
        boxShadow: '0 10px 25px -6px rgba(29, 78, 216, 0.4)',
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
      }}>
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 14, padding: 14, display: 'inline-flex' }}>
          <Building2 size={40} color="#fff" strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13, opacity: 0.85, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
            Firma Analizi
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {analiz.firma.ad}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <MetrikMini ikon={<FolderKanban size={18} />} etiket="Aktif Proje" deger={analiz.firmaToplam.projeSayisi} />
          <MetrikMini ikon={<Users size={18} />} etiket="Kullanıcı" deger={analiz.firmaToplam.kullanici} />
          <MetrikMini ikon={<MapPin size={18} />} etiket="Lokasyon" deger={analiz.firmaToplam.lokasyon} />
        </div>
      </div>

      {/* Sınırsız kullanım eşiği progress bar */}
      <SinirsizEsikBar firmaKdvHaric={firmaToplam.kdvHaric} />

      {/* Projeler tablosu */}
      <div>
        <SectionTitle icon={<FolderKanban size={18} color={T.slate} />}>Proje Bazlı Maliyet Analizi</SectionTitle>
        <div className="verde-card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 1100 }}>
            <thead>
              <tr style={{ background: T.slate, color: '#fff' }}>
                <Th>Proje</Th>
                <Th align="right">Kullanıcı</Th>
                <Th align="right">Lokasyon</Th>
                <Th align="right">Kullanıcı Maliyeti</Th>
                <Th align="right">Lokasyon Maliyeti</Th>
                <Th align="right">Değişken Toplam</Th>
                <Th align="right">Sabit Pay (%)</Th>
                <Th align="right">Sabit Payı</Th>
                <Th align="right">KDV Hariç</Th>
                <Th align="right">KDV Dahil</Th>
              </tr>
            </thead>
            <tbody>
              {projelerHesap.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: T.textSoft }}>
                    Bu firmaya ait proje kaydı bulunamadı.
                  </td>
                </tr>
              )}
              {projelerHesap.map((p, i) => {
                const isProjesiz = p.id === '__projesiz__'
                return (
                  <tr key={p.id} style={{
                    background: i % 2 === 0 ? '#fff' : T.slateLight,
                    opacity: isProjesiz || !p.aktif ? 0.75 : 1,
                  }}>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ color: isProjesiz ? T.textSoft : T.text, fontSize: 15 }}>{p.ad}</strong>
                        {!p.aktif && !isProjesiz && (
                          <span style={{ padding: '2px 6px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontSize: 10, fontWeight: 700 }}>PASİF</span>
                        )}
                        {isProjesiz && (
                          <span style={{ padding: '2px 6px', borderRadius: 999, background: '#e0e7ff', color: '#3730a3', fontSize: 10, fontWeight: 700 }}>ATANMAMIŞ</span>
                        )}
                      </div>
                    </Td>
                    <Td align="right" mono>{p.kullanici_sayisi}</Td>
                    <Td align="right" mono>{p.lokasyon_sayisi}</Td>
                    <Td align="right" mono>{fmtTL(p.kulMaliyet)}</Td>
                    <Td align="right" mono>{fmtTL(p.lokMaliyet)}</Td>
                    <Td align="right" mono bold>{fmtTL(p.degisken)}</Td>
                    <Td align="right" mono muted small>%{(p.sabitPayOran * 100).toFixed(1)}</Td>
                    <Td align="right" mono>{fmtTL(p.sabitPay)}</Td>
                    <Td align="right" mono bold style={{ color: T.blue }}>{fmtTL(p.kdvHaric)}</Td>
                    <Td align="right" mono bold style={{ color: T.green, fontSize: 15 }}>{fmtTL(p.kdvDahil)}</Td>
                  </tr>
                )
              })}
              {projelerHesap.length > 0 && (
                <tr style={{ background: T.blueLight, borderTop: `3px solid ${T.blue}` }}>
                  <Td bold><span style={{ color: T.blue, fontSize: 15 }}>FİRMA TOPLAMI</span></Td>
                  <Td align="right" mono bold>{firmaToplam.kullanici}</Td>
                  <Td align="right" mono bold>{firmaToplam.lokasyon}</Td>
                  <Td align="right" mono bold>{fmtTL(firmaToplam.kulMaliyet)}</Td>
                  <Td align="right" mono bold>{fmtTL(firmaToplam.lokMaliyet)}</Td>
                  <Td align="right" mono bold>{fmtTL(firmaToplam.degisken)}</Td>
                  <Td align="right" mono muted small>%100</Td>
                  <Td align="right" mono bold>{fmtTL(firmaToplam.sabitPay)}</Td>
                  <Td align="right" mono bold style={{ color: T.blue, fontSize: 16 }}>{fmtTL(firmaToplam.kdvHaric)}</Td>
                  <Td align="right" mono bold style={{ color: T.green, fontSize: 17 }}>{fmtTL(firmaToplam.kdvDahil)}</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '10px 4px 0', fontSize: 13, color: T.textSoft, fontStyle: 'italic' }}>
          * Sabit maliyet ({fmtTL(SABIT_TOPLAM)}) firma seviyesinde tektir. Her projeye,
          projenin değişken maliyet ağırlığı ({'kullanıcı × ' + FIYAT_KULLANICI + ' + lokasyon × ' + FIYAT_LOKASYON})
          firma toplam değişken maliyeti içindeki payı oranında dağıtılır.
        </p>
      </div>
    </>
  )
}

function SinirsizEsikBar({ firmaKdvHaric }: { firmaKdvHaric: number }) {
  const pct = Math.min(100, (firmaKdvHaric / SINIRSIZ_ESIK) * 100)
  const uzerinde = firmaKdvHaric > SINIRSIZ_ESIK
  const kalan = Math.max(0, SINIRSIZ_ESIK - firmaKdvHaric)

  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: uzerinde ? T.greenLight : T.blueLight,
            borderRadius: 10, padding: 8, display: 'inline-flex',
          }}>
            <InfinityIcon size={22} color={uzerinde ? T.green : T.blue} strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Sınırsız Kullanım Eşiği <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>(firma geneli)</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginTop: 2 }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', color: uzerinde ? T.green : T.blue, fontSize: 20, fontWeight: 900 }}>
                {fmtTL(firmaKdvHaric)}
              </span>
              <span style={{ color: T.textSoft, fontWeight: 500, margin: '0 6px' }}>/</span>
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>{fmtTL(SINIRSIZ_ESIK)}</span>
              <span style={{ color: T.textSoft, fontSize: 13, fontWeight: 500, marginLeft: 6 }}>(KDV Hariç)</span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Doluluk
          </div>
          <div style={{
            fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em',
            color: uzerinde ? T.green : T.blue, lineHeight: 1,
          }}>
            %{pct.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        position: 'relative', height: 22, borderRadius: 999,
        background: T.slateLight, overflow: 'hidden',
        border: `1px solid ${T.border}`,
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: uzerinde
            ? `linear-gradient(90deg, ${T.green}, ${T.blue})`
            : `linear-gradient(90deg, ${T.blue}, ${T.purple})`,
          transition: 'width 0.4s ease',
          boxShadow: uzerinde ? `0 0 12px ${T.green}66` : `0 0 8px ${T.blue}44`,
        }} />
      </div>

      {/* Alt bilgi */}
      <div style={{
        marginTop: 10, display: 'flex', justifyContent: 'space-between',
        fontSize: 13, color: T.textSoft, flexWrap: 'wrap', gap: 8,
      }}>
        {uzerinde ? (
          <div style={{ color: T.green, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <InfinityIcon size={15} />
            <span>Firma sınırsız kullanım eşiğinin üzerinde — sınırsız plan avantajı devrededir.</span>
          </div>
        ) : (
          <div>
            Sınırsız eşiğe kalan: <strong style={{ color: T.text, fontFamily: 'ui-monospace, monospace' }}>{fmtTL(kalan)}</strong>
          </div>
        )}
        <div>
          Firma toplam maliyeti tavan tutara ulaştığında sınırsız kullanım devreye girer.
        </div>
      </div>
    </div>
  )
}

// ─── SEKME 3: Özel Modüller ────────────────────────────────────────────

type OzelModul = {
  ad: string
  kod: string
  ikon: React.ReactNode
  renk: string
  kapsam: string
  aciklama: string
  fiyatTutar: number
  fiyatBirim: string    // ör: 'ay', 'tespit'
}

const OZEL_MODULLER: OzelModul[] = [
  {
    ad: 'Oto Yıkama',
    kod: 'OTO_YIKAMA',
    ikon: <Car size={17} color="#0891b2" />,
    renk: '#0891b2',
    kapsam: 'Araç yıkama takibi · Personel yönetimi · QR taramalı iş akışı',
    aciklama: 'Frekans bazlı yıkama planı, gerçek zamanlı görev takibi, arşiv ve raporlama',
    fiyatTutar: 5000,
    fiyatBirim: 'ay',
  },
  {
    ad: 'FMS — Facility Management System',
    kod: 'FMS',
    ikon: <Wrench size={17} color="#7c3aed" />,
    renk: '#7c3aed',
    kapsam: 'Tesis yönetimi · Bakım planlaması · Talep ve arıza takibi',
    aciklama: 'Firmaların tesis operasyonlarını uçtan uca yönettiği kapsamlı yönetim modülü',
    fiyatTutar: 5000,
    fiyatBirim: 'ay',
  },
  {
    ad: 'ATS — Akustik Kaçak Takip Sistemi',
    kod: 'ATS',
    ikon: <AudioLines size={17} color="#dc2626" />,
    renk: '#dc2626',
    kapsam: 'Akustik sensör verisi · Kaçak tespit ve konumlandırma · Uyarı yönetimi',
    aciklama: 'Su/gaz hatlarındaki kaçakları akustik veri işleyerek tespit eder — tespit başına faturalanır',
    fiyatTutar: 100,
    fiyatBirim: 'tespit',
  },
]

function OzelModullerSekmesi() {
  return (
    <>
      {/* Hero — GYS sabit payından etkilenmez uyarısı */}
      <div style={{
        background: `linear-gradient(135deg, #0891b2 0%, ${T.purple} 100%)`,
        borderRadius: 16, padding: '24px 28px', color: '#fff',
        boxShadow: '0 10px 25px -6px rgba(8, 145, 178, 0.4)',
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
      }}>
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 14, padding: 14, display: 'inline-flex' }}>
          <Package size={40} color="#fff" strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 13, opacity: 0.9, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
            GYS'den Bağımsız Özel Modüller
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Özel Modül Fiyatlandırması
          </div>
          <div style={{ fontSize: 14.5, opacity: 0.95, marginTop: 8, lineHeight: 1.5 }}>
            Bu modüller <strong>GYS sabit maliyet payından etkilenmez</strong>. Her modül kendi bağımsız
            fiyat kalemi olarak faturalanır.
          </div>
        </div>
      </div>

      {/* Modüller tablosu */}
      <div>
        <SectionTitle icon={<Package size={18} color={T.slate} />}>Özel Modül Kalemleri</SectionTitle>
        <div className="verde-card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 900 }}>
            <thead>
              <tr style={{ background: T.slate, color: '#fff' }}>
                <Th style={{ width: 50 }}>#</Th>
                <Th>Modül</Th>
                <Th>Kapsam</Th>
                <Th>Açıklama</Th>
                <Th align="right" style={{ width: 220 }}>Fiyatlandırma (KDV Hariç)</Th>
              </tr>
            </thead>
            <tbody>
              {OZEL_MODULLER.map((m, i) => (
                <tr key={m.kod} style={{ background: i % 2 === 0 ? '#fff' : T.slateLight }}>
                  <Td align="center" muted>{i + 1}</Td>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        background: m.renk + '18', borderRadius: 8, padding: 6,
                        display: 'inline-flex',
                      }}>{m.ikon}</div>
                      <strong style={{ color: T.text, fontSize: 16 }}>{m.ad}</strong>
                    </div>
                  </Td>
                  <Td muted>{m.kapsam}</Td>
                  <Td muted small>{m.aciklama}</Td>
                  <Td align="right">
                    <div style={{
                      display: 'inline-flex', alignItems: 'baseline', gap: 4,
                      fontFamily: 'ui-monospace, monospace',
                    }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: m.renk }}>
                        {fmtTL(m.fiyatTutar)}
                      </span>
                      <span style={{ fontSize: 13, color: T.textSoft, fontWeight: 600 }}>
                        / {m.fiyatBirim}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.textSoft, marginTop: 2 }}>+ KDV</div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fiyat politikası notu */}
      <div className="verde-card" style={{
        padding: 20, background: T.amberLight, border: `1px solid ${T.amber}`,
        display: 'flex', gap: 14, alignItems: 'flex-start',
      }}>
        <Info size={22} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 15, color: '#78350f', lineHeight: 1.65 }}>
          <strong style={{ display: 'block', marginBottom: 8, color: '#92400e', fontSize: 16 }}>
            Özel Modül Fiyat Politikası
          </strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              Özel modül tasarımları <strong>satış</strong> veya <strong>aylık kiralık</strong> olarak ücretlendirilebilir.
            </li>
            <li>
              Fiyat politikası modülün kapsamına göre değişiklik gösterir.
            </li>
            <li>
              <strong>1 aylık çalışma sonunda devreye alınabilir</strong> bir modül için standart fiyatlandırma:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>Aylık kiralama: <strong>{fmtTL(5000)} / ay + KDV</strong></li>
                <li>Satış (tek seferlik): <strong>{fmtTL(150000)} + KDV</strong></li>
              </ul>
            </li>
            <li>
              Özel modüller GYS sabit maliyet payından etkilenmez — her biri bağımsız fiyat kalemi olarak faturalanır.
            </li>
          </ul>
        </div>
      </div>
    </>
  )
}

function MetrikMini({ ikon, etiket, deger }: { ikon: React.ReactNode; etiket: string; deger: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.85, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {ikon}
        <span>{etiket}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em' }}>{deger}</div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} style={{
      padding: '12px 20px', fontSize: 15, fontWeight: 700,
      background: 'transparent', border: 'none', cursor: 'pointer',
      borderBottom: active ? `3px solid ${T.blue}` : '3px solid transparent',
      color: active ? T.blue : T.textSoft, marginBottom: -2,
      display: 'flex', alignItems: 'center', gap: 8,
      transition: 'color 0.15s',
    }}>
      {icon}
      {children}
    </button>
  )
}

// ─── Alt bileşenler ──────────────────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
      fontSize: 15, fontWeight: 800, color: T.slate,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {icon}
      {children}
    </div>
  )
}

function BirimKart({ ikon, renk, baslik, fiyat, aciklama }: {
  ikon: React.ReactNode; renk: string; baslik: string; fiyat: number; aciklama: string
}) {
  return (
    <div className="verde-card" style={{
      padding: 26, position: 'relative', overflow: 'hidden',
      borderTop: `5px solid ${renk}`,
    }}>
      <div style={{
        position: 'absolute', top: 16, right: 16,
        background: renk, borderRadius: 12, padding: 12,
        display: 'inline-flex',
      }}>{ikon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {baslik}
      </div>
      <div style={{ marginTop: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 52, fontWeight: 900, color: renk, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {fiyat}
        </span>
        <span style={{ fontSize: 22, fontWeight: 800, color: renk, marginLeft: 6 }}>₺</span>
        <span style={{ fontSize: 14, color: T.textSoft, marginLeft: 8 }}>+ KDV / ay</span>
      </div>
      <div style={{ fontSize: 14.5, color: T.textSoft, lineHeight: 1.5 }}>
        {aciklama}
      </div>
    </div>
  )
}

function Th({ children, align = 'left', style }: { children: React.ReactNode; align?: 'left' | 'right' | 'center'; style?: React.CSSProperties }) {
  return (
    <th style={{
      padding: '14px 18px', fontSize: 13, fontWeight: 800,
      textAlign: align, letterSpacing: '0.06em', textTransform: 'uppercase',
      borderBottom: '1px solid rgba(255,255,255,0.15)', ...style,
    }}>{children}</th>
  )
}

function Td({ children, align = 'left', muted, bold, mono, small, colSpan, style }: {
  children: React.ReactNode; align?: 'left' | 'right' | 'center'
  muted?: boolean; bold?: boolean; mono?: boolean; small?: boolean; colSpan?: number
  style?: React.CSSProperties
}) {
  return (
    <td colSpan={colSpan} style={{
      padding: '14px 18px', fontSize: small ? 13.5 : 15,
      textAlign: align, color: muted ? T.textSoft : T.text,
      fontWeight: bold ? 700 : 400,
      fontFamily: mono ? 'ui-monospace, monospace' : undefined,
      borderBottom: `1px solid ${T.border}`, ...style,
    }}>{children}</td>
  )
}

function OzetSatir({ label, tutar, bold, muted, border, highlight, highlight2 }: {
  label: string; tutar: number; bold?: boolean; muted?: boolean; border?: boolean; highlight?: boolean; highlight2?: boolean
}) {
  return (
    <tr style={{
      borderTop: border ? `2px dashed ${T.border}` : undefined,
    }}>
      <td style={{
        padding: highlight || highlight2 ? '14px 14px' : '9px 14px',
        fontSize: highlight2 ? 16 : (highlight ? 15.5 : 14.5),
        color: highlight2 ? '#065f46' : (highlight ? T.blue : (muted ? T.textSoft : T.text)),
        fontWeight: bold ? 800 : 500,
        letterSpacing: (highlight || highlight2) ? '0.02em' : undefined,
      }}>{label}</td>
      <td style={{
        padding: highlight || highlight2 ? '14px 14px' : '9px 14px',
        fontSize: highlight2 ? 22 : (highlight ? 19 : 15),
        color: highlight2 ? T.green : (highlight ? T.blue : (muted ? T.textSoft : T.text)),
        fontWeight: bold ? 900 : 600,
        fontFamily: 'ui-monospace, monospace',
        textAlign: 'right',
      }}>{fmtTL(tutar)}</td>
    </tr>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '12px 16px', fontSize: 18, fontWeight: 800,
  border: `1px solid ${T.border}`, borderRadius: 10, background: '#fff',
  color: T.text, outline: 'none',
}
