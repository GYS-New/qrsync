'use client'

import { useMemo, useState } from 'react'
import { Users, MapPin, Server, Database, Bot, Globe, Infinity as InfinityIcon, Calculator, Info, TrendingUp, Building2, Layers } from 'lucide-react'

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
const SINIRSIZ_ESIK = 264500     // TL / ay (KDV Hariç)
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
    ad: 'Sunucu Aylık Kira',
    ikon: <Server size={16} color={T.blue} />,
    kapasite: '300 kullanıcı · 1.500 görev/gün · 4 GB ön bellek',
    aciklama: '0-300 kullanıcı aktivitesi, 0-3.000 günlük veri işleme kapasitesi',
    tutar: 7650,
  },
  {
    ad: 'Veritabanı Aylık Kira',
    ikon: <Database size={16} color={T.purple} />,
    kapasite: '8 GB SSD depolama',
    aciklama: 'Kapasiteye göre 1 yıllık veri depolama',
    tutar: 3916,
  },
  {
    ad: 'Yapay Zeka Modeli Aylık Kira',
    ikon: <Bot size={16} color={T.green} />,
    kapasite: '300 kullanıcı · 1.500 görev/gün',
    aciklama: 'Kapasiteye göre anlık izleme',
    tutar: 5300,
  },
  {
    ad: 'Web İşletme Maliyeti',
    ikon: <Globe size={16} color={T.amber} />,
    kapasite: '300 user aktivite · 1.500 görev/gün',
    aciklama: 'Genel işletme ve web yazılım geliştirme',
    tutar: 16750,
  },
]
const SABIT_TOPLAM = SABIT_KALEMLER.reduce((s, k) => s + k.tutar, 0) // 33.616 TL

function fmtTL(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + ' ₺'
}

export default function UcretlendirmePolitikasiClient() {
  // Hesap girdileri — proje seviyesinde kullanici + lokasyon,
  // firma seviyesinde toplam proje sayisi (sabit maliyeti bolmek icin)
  const [kullaniciSayisi, setKullaniciSayisi] = useState<number>(100)
  const [lokasyonSayisi, setLokasyonSayisi] = useState<number>(50)
  const [projeSayisi, setProjeSayisi] = useState<number>(1)

  const hesap = useMemo(() => {
    const u = Math.max(0, kullaniciSayisi || 0)
    const l = Math.max(0, lokasyonSayisi || 0)
    const p = Math.max(1, projeSayisi || 1)
    const kullaniciMaliyeti = u * FIYAT_KULLANICI
    const lokasyonMaliyeti = l * FIYAT_LOKASYON
    const projeDegisken = kullaniciMaliyeti + lokasyonMaliyeti
    // Sabit maliyet firma seviyesinde tek — proje sayisina bolunur
    const sabitPay = SABIT_TOPLAM / p
    const projeKdvHaric = sabitPay + projeDegisken
    const projeKdv = projeKdvHaric * KDV_ORAN
    const projeKdvDahil = projeKdvHaric + projeKdv
    // Firma seviyesinde (tum projeler icin varsayilan olarak: N proje ayni degisken)
    const firmaKdvHaric = SABIT_TOPLAM + projeDegisken * p
    const firmaKdv = firmaKdvHaric * KDV_ORAN
    const firmaKdvDahil = firmaKdvHaric + firmaKdv
    // Sinirsiz esik firma seviyesindeki toplam ile karsilastirilir
    const sinirsizPct = Math.min(100, (firmaKdvHaric / SINIRSIZ_ESIK) * 100)
    const sinirsizUzerinde = firmaKdvHaric > SINIRSIZ_ESIK
    return {
      u, l, p,
      kullaniciMaliyeti, lokasyonMaliyeti, projeDegisken,
      sabitPay,
      projeKdvHaric, projeKdv, projeKdvDahil,
      firmaKdvHaric, firmaKdv, firmaKdvDahil,
      sinirsizPct, sinirsizUzerinde,
    }
  }, [kullaniciSayisi, lokasyonSayisi, projeSayisi])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200, margin: '0 auto' }}>
      {/* HERO */}
      <div style={{
        background: `linear-gradient(135deg, ${T.blue} 0%, ${T.purple} 100%)`,
        borderRadius: 14, padding: '20px 26px', color: '#fff',
        boxShadow: '0 10px 25px -8px rgba(29, 78, 216, 0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <TrendingUp size={22} />
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>
            GYS Ücretlendirme Politikası
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, opacity: 0.95 }}>
          Görev Yönetim Sistemi (GYS) ücretlendirme yapısı; <strong>sabit altyapı maliyetleri</strong> ile
          <strong> kullanıcı ve lokasyon (QR) başına değişken bileşenlerden</strong> oluşur.
          Rakamlar KDV hariçtir. Nihai fiyat her projenin ihtiyacına, kapasite ve destek
          seviyesine göre farklılık gösterir.
        </p>
      </div>

      {/* DEĞİŞKEN BİRİM FİYATLAR */}
      <div>
        <SectionTitle icon={<Users size={15} color={T.slate} />}>Değişken Birim Fiyatlar</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
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
        <SectionTitle icon={<Server size={15} color={T.slate} />}>Sabit Altyapı ve İşletme Maliyetleri</SectionTitle>
        <div style={{
          background: T.blueLight, border: `1px solid ${T.blue}`, borderRadius: 10,
          padding: '10px 14px', marginBottom: 10, display: 'flex', gap: 10,
          alignItems: 'flex-start', fontSize: 12.5, color: '#1e3a8a', lineHeight: 1.5,
        }}>
          <Building2 size={16} color={T.blue} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            Aşağıdaki sabit maliyet <strong>firma seviyesindedir</strong> — bir firma için
            <strong> tek bir kez</strong> ödenir ve firmanın tüm projelerine paylaştırılır. Proje bazlı
            hesapta bu maliyet, firmanın toplam proje sayısına bölünerek her projeye adil bir pay olarak yansıtılır.
          </div>
        </div>
        <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: T.slate, color: '#fff' }}>
                <Th style={{ width: 40 }}>#</Th>
                <Th>Kalem</Th>
                <Th>Kapasite / Özellik</Th>
                <Th>Açıklama</Th>
                <Th align="right" style={{ width: 140 }}>Aylık Bedel (KDV Hariç)</Th>
              </tr>
            </thead>
            <tbody>
              {SABIT_KALEMLER.map((k, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : T.slateLight }}>
                  <Td align="center" muted>{i + 1}</Td>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {k.ikon}
                      <strong style={{ color: T.text }}>{k.ad}</strong>
                    </div>
                  </Td>
                  <Td muted>{k.kapasite}</Td>
                  <Td muted small>{k.aciklama}</Td>
                  <Td align="right" mono bold>{fmtTL(k.tutar)}</Td>
                </tr>
              ))}
              <tr style={{ background: T.blueLight, borderTop: `2px solid ${T.blue}` }}>
                <Td colSpan={4} align="right" bold>
                  <span style={{ color: T.blue }}>SABİT MALİYET TOPLAMI</span>
                </Td>
                <Td align="right" mono bold style={{ color: T.blue, fontSize: 15 }}>
                  {fmtTL(SABIT_TOPLAM)}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ margin: '8px 4px 0', fontSize: 12, color: T.textSoft, fontStyle: 'italic' }}>
          * Sabit maliyetler; sunucu, veritabanı, yapay zeka altyapısı ve web platform işletmesi olmak üzere temel altyapıyı kapsar.
        </p>
      </div>

      {/* SINIRSIZ KULLANIM EŞİĞİ */}
      <div style={{
        background: `linear-gradient(135deg, ${T.green} 0%, ${T.blue} 100%)`,
        borderRadius: 14, padding: '18px 24px', color: '#fff',
        boxShadow: '0 8px 20px -6px rgba(5, 150, 105, 0.35)',
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: 12,
          display: 'inline-flex',
        }}>
          <InfinityIcon size={38} color="#fff" strokeWidth={2.4} />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 12, opacity: 0.9, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
            Sınırsız Kullanım Üst Ödeme Eşiği
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {fmtTL(SINIRSIZ_ESIK)} <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.9 }}>/ ay (KDV Hariç)</span>
          </div>
        </div>
        <div style={{ maxWidth: 380, fontSize: 12.5, lineHeight: 1.5, opacity: 0.95 }}>
          Bu tavan tutar üzerinde ödeme yapan projeler; <strong>sınırsız kullanıcı ve lokasyon
          kullanımına uygun sunucu, altyapı, geliştirme ve yönetim destek hizmetlerinden</strong>
          bütünüyle faydalanır.
        </div>
      </div>

      {/* HESAP MAKİNESİ */}
      <div>
        <SectionTitle icon={<Calculator size={15} color={T.slate} />}>Aylık Maliyet Hesaplayıcı</SectionTitle>
        <div className="verde-card" style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
                Kullanıcı Sayısı <span style={{ textTransform: 'none', fontWeight: 500, opacity: 0.7 }}>(proje)</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={18} color={T.blue} />
                <input
                  type="number" min={0} value={kullaniciSayisi}
                  onChange={e => setKullaniciSayisi(parseInt(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
              <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>
                × {fmtTL(FIYAT_KULLANICI)} = <strong style={{ color: T.blue }}>{fmtTL(hesap.kullaniciMaliyeti)}</strong>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
                Lokasyon (QR) Sayısı <span style={{ textTransform: 'none', fontWeight: 500, opacity: 0.7 }}>(proje)</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={18} color={T.purple} />
                <input
                  type="number" min={0} value={lokasyonSayisi}
                  onChange={e => setLokasyonSayisi(parseInt(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
              <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>
                × {fmtTL(FIYAT_LOKASYON)} = <strong style={{ color: T.purple }}>{fmtTL(hesap.lokasyonMaliyeti)}</strong>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
                Firmada Toplam Proje Sayısı
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={18} color={T.slate} />
                <input
                  type="number" min={1} value={projeSayisi}
                  onChange={e => setProjeSayisi(parseInt(e.target.value) || 1)}
                  style={inputStyle}
                />
              </div>
              <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>
                Sabit ÷ {hesap.p} = <strong style={{ color: T.slate }}>{fmtTL(hesap.sabitPay)}</strong> / proje
              </div>
            </div>
          </div>

          {/* İki panel: Proje bazlı + Firma toplamı */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {/* Sol: Proje bazlı */}
            <div style={{ background: T.blueLight, borderRadius: 10, padding: 14, border: `1px solid ${T.blue}33` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12, fontWeight: 800, color: T.blue, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Calculator size={14} />
                Proje Bazlı Aylık Maliyet
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  <OzetSatir label={`Sabit Pay (${hesap.p} projeye bölünmüş)`} tutar={hesap.sabitPay} muted />
                  <OzetSatir label="Kullanıcı Maliyeti" tutar={hesap.kullaniciMaliyeti} muted />
                  <OzetSatir label="Lokasyon (QR) Maliyeti" tutar={hesap.lokasyonMaliyeti} muted />
                  <OzetSatir label="Proje Değişken Ara Toplam" tutar={hesap.projeDegisken} border />
                  <OzetSatir label="PROJE TOPLAMI (KDV HARİÇ)" tutar={hesap.projeKdvHaric} bold highlight />
                  <OzetSatir label={`KDV (%${KDV_ORAN * 100})`} tutar={hesap.projeKdv} muted />
                  <OzetSatir label="PROJE TOPLAMI (KDV DAHİL)" tutar={hesap.projeKdvDahil} bold highlight2 />
                </tbody>
              </table>
            </div>
            {/* Sağ: Firma toplamı */}
            <div style={{ background: '#faf5ff', borderRadius: 10, padding: 14, border: `1px solid ${T.purple}33` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12, fontWeight: 800, color: T.purple, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Building2 size={14} />
                Firma Toplamı (Tüm Projeler)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  <OzetSatir label="Sabit Maliyet (firma tek)" tutar={SABIT_TOPLAM} muted />
                  <OzetSatir label={`Değişken × ${hesap.p} proje`} tutar={hesap.projeDegisken * hesap.p} muted />
                  <OzetSatir label="FİRMA TOPLAMI (KDV HARİÇ)" tutar={hesap.firmaKdvHaric} bold highlight />
                  <OzetSatir label={`KDV (%${KDV_ORAN * 100})`} tutar={hesap.firmaKdv} muted />
                  <OzetSatir label="FİRMA TOPLAMI (KDV DAHİL)" tutar={hesap.firmaKdvDahil} bold highlight2 />
                </tbody>
              </table>
              <div style={{ marginTop: 8, fontSize: 11, color: T.textSoft, fontStyle: 'italic' }}>
                * Değişken tutar tüm projelerin aynı boyutta olduğu varsayımıyla gösterilir. Gerçekte her proje kendi kullanıcı/lokasyon adediyle hesaplanır.
              </div>
            </div>
          </div>

          {/* Sınırsız eşik barı — firma toplamı üzerinden */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: T.textSoft }}>
              <span>Sınırsız Eşiğe Yakınlık <strong style={{ color: T.slate }}>(firma toplamı)</strong></span>
              <strong style={{ color: hesap.sinirsizUzerinde ? T.green : T.slate }}>
                %{hesap.sinirsizPct.toFixed(1)}
              </strong>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: T.slateLight, overflow: 'hidden' }}>
              <div style={{
                width: `${hesap.sinirsizPct}%`, height: '100%',
                background: hesap.sinirsizUzerinde
                  ? `linear-gradient(90deg, ${T.green}, ${T.blue})`
                  : `linear-gradient(90deg, ${T.blue}, ${T.purple})`,
                transition: 'width 0.3s ease',
              }} />
            </div>
            {hesap.sinirsizUzerinde && (
              <div style={{
                marginTop: 10, padding: '10px 14px', background: T.greenLight,
                border: `1px solid ${T.green}`, borderRadius: 8, color: '#065f46', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <InfinityIcon size={16} />
                <span>Bu firma <strong>sınırsız kullanım eşiğinin üzerinde</strong> — sınırsız plan avantajı devreye girer.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* NOTLAR */}
      <div className="verde-card" style={{
        padding: 16, background: T.amberLight, border: `1px solid ${T.amber}`,
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <Info size={18} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
          <strong style={{ display: 'block', marginBottom: 4, color: '#92400e' }}>Önemli Notlar</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Tüm fiyatlar Türk Lirası (₺) cinsinden, aylık ve KDV hariçtir. KDV oranı %{KDV_ORAN * 100}'dir.</li>
            <li><strong>Sabit maliyet firma seviyesinde tek ödenir</strong> — firmanın tüm projelerine paylaştırılır, her proje için ayrıca faturalanmaz.</li>
            <li>Yukarıdaki ücretlendirme her projenin ihtiyacına, kapasite ve destek seviyesine göre farklılık gösterir.</li>
            <li>Sınırsız kullanım eşiği <strong>firma toplam maliyeti</strong> üzerinden değerlendirilir; aşan firmalar için kullanıcı ve lokasyon bazlı ek ücret uygulanmaz, tavan tutar uygulanır.</li>
            <li>Özel entegrasyon, yeni modül geliştirme ve saha destek hizmetleri ayrıca fiyatlandırılır.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// ─── Alt bileşenler ──────────────────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      fontSize: 12, fontWeight: 800, color: T.slate,
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
      padding: 18, position: 'relative', overflow: 'hidden',
      borderTop: `4px solid ${renk}`,
    }}>
      <div style={{
        position: 'absolute', top: 12, right: 12,
        background: renk, borderRadius: 10, padding: 8,
        display: 'inline-flex',
      }}>{ikon}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {baslik}
      </div>
      <div style={{ marginTop: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 34, fontWeight: 900, color: renk, letterSpacing: '-0.02em' }}>
          {fiyat}
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, color: renk, marginLeft: 4 }}>₺</span>
        <span style={{ fontSize: 12, color: T.textSoft, marginLeft: 6 }}>+ KDV / ay</span>
      </div>
      <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.45 }}>
        {aciklama}
      </div>
    </div>
  )
}

function Th({ children, align = 'left', style }: { children: React.ReactNode; align?: 'left' | 'right' | 'center'; style?: React.CSSProperties }) {
  return (
    <th style={{
      padding: '11px 14px', fontSize: 11.5, fontWeight: 800,
      textAlign: align, letterSpacing: '0.05em', textTransform: 'uppercase',
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
      padding: '10px 14px', fontSize: small ? 12 : 13.5,
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
        padding: highlight || highlight2 ? '10px 12px' : '6px 12px',
        fontSize: highlight2 ? 14 : (highlight ? 13.5 : 13),
        color: highlight2 ? '#065f46' : (highlight ? T.blue : (muted ? T.textSoft : T.text)),
        fontWeight: bold ? 800 : 500,
        letterSpacing: (highlight || highlight2) ? '0.02em' : undefined,
      }}>{label}</td>
      <td style={{
        padding: highlight || highlight2 ? '10px 12px' : '6px 12px',
        fontSize: highlight2 ? 18 : (highlight ? 16 : 13),
        color: highlight2 ? T.green : (highlight ? T.blue : (muted ? T.textSoft : T.text)),
        fontWeight: bold ? 900 : 600,
        fontFamily: 'ui-monospace, monospace',
        textAlign: 'right',
      }}>{fmtTL(tutar)}</td>
    </tr>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '8px 12px', fontSize: 15, fontWeight: 700,
  border: `1px solid ${T.border}`, borderRadius: 8, background: '#fff',
  color: T.text, outline: 'none',
}
