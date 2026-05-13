import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Gizlilik Politikası',
  description:
    'İOGYS uygulamasının gizlilik politikası — toplanan veriler, kullanım amaçları, KVKK kapsamında haklarınız ve iletişim bilgileri.',
}

// Public sayfa: auth gerekmez, mobil cihaz redirect'inden bypass — middleware'de tanımlı.

const STIL = {
  sayfa: { padding: '40px 24px', maxWidth: 880, margin: '0 auto', color: '#0f172a', lineHeight: 1.65 },
  baslik: { fontSize: 28, fontWeight: 800, marginTop: 0, marginBottom: 8 },
  altbaslik: { fontSize: 14, color: '#64748b', marginTop: 0, marginBottom: 24 },
  h2: { fontSize: 18, fontWeight: 800, marginTop: 28, marginBottom: 10, color: '#0f172a' },
  h3: { fontSize: 15, fontWeight: 700, marginTop: 18, marginBottom: 6, color: '#0f172a' },
  p: { fontSize: 14, marginTop: 0, marginBottom: 12 },
  ul: { fontSize: 14, marginTop: 0, marginBottom: 12, paddingLeft: 22 },
  li: { marginBottom: 6 },
  kart: { padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13 },
  vurgu: { background: '#eff6ff', border: '1px solid #bfdbfe', padding: 12, borderRadius: 8, fontSize: 13, color: '#1e3a8a' },
} as const

export default function PrivacyPolicyPage() {
  return (
    <div style={STIL.sayfa}>
      <h1 style={STIL.baslik}>Gizlilik Politikası</h1>
      <p style={STIL.altbaslik}>Yürürlük tarihi: 13 Mayıs 2026 · İOGYS Mobil ve Web Uygulaması</p>

      <div style={STIL.vurgu}>
        Bu Gizlilik Politikası, İOGYS uygulamasını kullanan kişisel verilerin nasıl toplandığını, işlendiğini, saklandığını
        ve korunduğunu açıklar. 6698 sayılı <strong>Kişisel Verilerin Korunması Kanunu (KVKK)</strong> ve Apple App Store
        gereksinimlerine uygun olarak hazırlanmıştır.
      </div>

      <h2 style={STIL.h2}>1. Veri Sorumlusu</h2>
      <div style={STIL.kart}>
        <p style={{ margin: 0, marginBottom: 6 }}><strong>UNITED YAZILIM TEKNOLOJİLERİ ANONİM ŞİRKETİ</strong></p>
        <p style={{ margin: 0, marginBottom: 4 }}>Adres: ÖGE SK Bina No: 20 Kapı No: 17, KAVACIK MAH., BEYKOZ / İSTANBUL</p>
        <p style={{ margin: 0, marginBottom: 4 }}>VKN: 8920644470 · BEYKOZ VERGİ DAİRESİ MÜD.</p>
        <p style={{ margin: 0, marginBottom: 4 }}>E-Posta: <a href="mailto:info@uniteds.com.tr" style={{ color: '#1d4ed8' }}>info@uniteds.com.tr</a></p>
        <p style={{ margin: 0 }}>Yetkili: BİROL ŞEKERCİ</p>
      </div>

      <h2 style={STIL.h2}>2. Topladığımız Kişisel Veriler</h2>
      <p style={STIL.p}>
        İOGYS uygulaması, görev yönetimi hizmetini sunabilmek için aşağıdaki veri kategorilerini toplar:
      </p>

      <h3 style={STIL.h3}>2.1 Kimlik Bilgileri</h3>
      <ul style={STIL.ul}>
        <li style={STIL.li}>Ad ve soyad</li>
        <li style={STIL.li}>İş yeri kullanıcı kimliği (firma yöneticisi tarafından atanır)</li>
        <li style={STIL.li}>Rol bilgisi (ör. operatör, yönetici)</li>
      </ul>

      <h3 style={STIL.h3}>2.2 Cihaz Bilgileri</h3>
      <ul style={STIL.ul}>
        <li style={STIL.li}>Cihaz modeli, işletim sistemi (Android / iOS) ve sürümü</li>
        <li style={STIL.li}>Uygulama sürümü</li>
        <li style={STIL.li}>Push bildirim için Firebase Cloud Messaging (FCM) token bilgisi</li>
      </ul>

      <h3 style={STIL.h3}>2.3 Görev İşlem Verileri</h3>
      <ul style={STIL.ul}>
        <li style={STIL.li}>Görev başlatma ve tamamlama zaman damgaları</li>
        <li style={STIL.li}>Görev tamamlama sırasında doldurulan kontrol listeleri (çeklist) cevapları</li>
        <li style={STIL.li}>İsteğe bağlı görev fotoğrafları (sadece kullanıcı eklediğinde — kamera/galeri erişimi)</li>
        <li style={STIL.li}>QR / NFC okutma kayıtları (görevin doğru lokasyonda yapıldığının doğrulanması için)</li>
      </ul>

      <p style={STIL.p}><strong>Toplanmayan veriler:</strong> İOGYS, konum (GPS), kişiler, mesajlar, takvim, reklam tanımlayıcısı veya kullanım analizine yönelik üçüncü taraf izleme verisi <strong>toplamaz</strong>. Uygulama, kullanıcıları izlemek (tracking) için herhangi bir veri kullanmaz.</p>

      <h2 style={STIL.h2}>3. Veri İşleme Amacı ve Hukuki Sebebi</h2>
      <p style={STIL.p}>Toplanan veriler aşağıdaki amaçlarla işlenir:</p>
      <ul style={STIL.ul}>
        <li style={STIL.li}><strong>Hizmetin sunulması:</strong> Görev atama, takip, tamamlama akışlarının yürütülmesi</li>
        <li style={STIL.li}><strong>Bildirimler:</strong> Yeni görev veya hatırlatma push bildirimlerinin gönderilmesi</li>
        <li style={STIL.li}><strong>Raporlama:</strong> İşveren firmanın operasyonel verimlilik raporlarının üretilmesi</li>
        <li style={STIL.li}><strong>Güvenlik ve denetim:</strong> İşlem doğrulama (audit log), sahtecilik ve hata önleme</li>
      </ul>
      <p style={STIL.p}>
        Hukuki sebepler: <em>sözleşmenin ifası</em>, <em>kanuni yükümlülük</em>, <em>meşru menfaat</em> ve gerektiğinde
        <em> açık rıza</em> (KVKK m. 5).
      </p>

      <h2 style={STIL.h2}>4. Veri Saklama Süresi</h2>
      <p style={STIL.p}>
        Kişisel veriler, hizmetin sürdüğü dönem boyunca ve iş ilişkisinin sona ermesinin ardından mevzuatın öngördüğü
        süre boyunca (genel olarak 10 yıla kadar) saklanır. Bu sürenin sonunda veriler anonimleştirilir veya silinir.
      </p>

      <h2 style={STIL.h2}>5. Verilerin Paylaşılması</h2>
      <p style={STIL.p}>
        Kişisel verileriniz, aşağıdaki sınırlı durumlar dışında üçüncü taraflarla paylaşılmaz:
      </p>
      <ul style={STIL.ul}>
        <li style={STIL.li}><strong>İşveren firma:</strong> Görevlerinizi atayan ve denetleyen firma yöneticileri</li>
        <li style={STIL.li}><strong>Hizmet sağlayıcılar:</strong> Veri tabanı barındırma (Supabase, AB sunucuları), push bildirim altyapısı (Google Firebase Cloud Messaging) — yalnızca hizmet için gereken minimum veri</li>
        <li style={STIL.li}><strong>Yetkili kamu kurumları:</strong> Yasal yükümlülüğün gerektirdiği hallerde</li>
      </ul>
      <p style={STIL.p}>
        Hiçbir koşulda kişisel verileriniz reklam veya pazarlama amacıyla satılmaz veya paylaşılmaz.
      </p>

      <h2 style={STIL.h2}>6. Veri Güvenliği</h2>
      <p style={STIL.p}>
        Veriler, endüstri standardı şifreleme (HTTPS / TLS) ile aktarılır ve şifreli olarak saklanır. Erişim kontrolleri
        (rol bazlı yetkilendirme, RLS) ve denetim kayıtları (audit log) uygulanır. Yetkisiz erişimi önlemek için düzenli
        güvenlik incelemeleri yapılır.
      </p>

      <h2 style={STIL.h2}>7. KVKK Kapsamındaki Haklarınız</h2>
      <p style={STIL.p}>KVKK m. 11 gereğince aşağıdaki haklara sahipsiniz:</p>
      <ul style={STIL.ul}>
        <li style={STIL.li}>Verilerinizin işlenip işlenmediğini öğrenme</li>
        <li style={STIL.li}>İşlenmişse buna ilişkin bilgi talep etme</li>
        <li style={STIL.li}>İşleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme</li>
        <li style={STIL.li}>Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme</li>
        <li style={STIL.li}>Eksik veya yanlış işlenen verilerin düzeltilmesini isteme</li>
        <li style={STIL.li}>KVKK m. 7'de öngörülen şartlar çerçevesinde silinmesini veya yok edilmesini isteme</li>
        <li style={STIL.li}>Otomatik sistemler ile analiz sonucunda aleyhinize bir sonuç çıkması halinde itiraz etme</li>
        <li style={STIL.li}>Kanuna aykırı işlenmesi sebebiyle zarara uğramanız halinde tazminat talep etme</li>
      </ul>
      <p style={STIL.p}>
        Bu haklarınızı kullanmak için aşağıdaki iletişim bilgileri üzerinden başvurabilirsiniz. Başvurularınız en geç
        30 gün içinde yanıtlanır.
      </p>

      <h2 style={STIL.h2}>8. Çocukların Gizliliği</h2>
      <p style={STIL.p}>
        İOGYS, kurumsal bir görev yönetim aracıdır ve <strong>13 yaşın altındaki kullanıcılardan bilerek veri
        toplamaz</strong>. Uygulama yetişkin çalışanların kullanımı için tasarlanmıştır.
      </p>

      <h2 style={STIL.h2}>9. Politika Değişiklikleri</h2>
      <p style={STIL.p}>
        Bu Gizlilik Politikası zaman zaman güncellenebilir. Önemli değişiklikler uygulama içinde duyurulur. Politikanın
        en güncel hali her zaman bu sayfada (<a href="https://iogys.com.tr/privacy-policy" style={{ color: '#1d4ed8' }}>https://iogys.com.tr/privacy-policy</a>) yayınlanır.
      </p>

      <h2 style={STIL.h2}>10. İletişim</h2>
      <p style={STIL.p}>Gizlilik politikası, veri kullanımı veya KVKK kapsamındaki haklarınız hakkında her türlü sorunuz için:</p>
      <div style={STIL.kart}>
        <p style={{ margin: 0, marginBottom: 6 }}><strong>UNITED YAZILIM TEKNOLOJİLERİ ANONİM ŞİRKETİ</strong></p>
        <p style={{ margin: 0, marginBottom: 4 }}>E-Posta: <a href="mailto:info@uniteds.com.tr" style={{ color: '#1d4ed8' }}>info@uniteds.com.tr</a></p>
        <p style={{ margin: 0 }}>Adres: ÖGE SK Bina No: 20 Kapı No: 17, KAVACIK MAH., BEYKOZ / İSTANBUL</p>
      </div>

      <p style={{ ...STIL.p, marginTop: 40, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
        © {new Date().getFullYear()} UNITED YAZILIM TEKNOLOJİLERİ A.Ş. — Tüm hakları saklıdır.
      </p>
    </div>
  )
}
