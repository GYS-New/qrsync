'use client'

import React, { useState, useEffect } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { Plus, Edit2, Trash2, Save, X, FileText, Lock } from 'lucide-react'

interface RaporSablonu {
  id: string
  ad: string
  aciklama?: string
  icerik: {
    alanlar: Array<{
      id: string
      ad: string
      tip: string
    }>
    siralama: string[]
  }
  varsayilan: boolean
  aktif: boolean
  kayit_tarihi: string
  guncelleme_tarihi?: string
  olusturan?: { isim_soyisim: string }
  guncelleyen?: { isim_soyisim: string }
}

interface Props {
  base: string
  projeId?: string | null
}

export default function RaporSablonlariClient({ base, projeId }: Props) {
  const { toast } = useToast()
  const [sablonlar, setSablonlar] = useState<RaporSablonu[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [yeniSablonAcik, setYeniSablonAcik] = useState(false)
  const [formData, setFormData] = useState({
    ad: '',
    aciklama: '',
    icerik: {
      alanlar: [
        { id: 'gorev_durumu', ad: 'Görev Durumu', tip: 'durum_dagilimi' },
        { id: 'personel_performans', ad: 'Personel Performans', tip: 'tablo' },
      ],
      siralama: ['gorev_durumu', 'personel_performans']
    }
  })

  // Şablonları yükle
  const sablonlariYukle = async () => {
    try {
      setLoading(true)
      const url = projeId ? `/api/rapor-sablonlari?proje_id=${projeId}` : '/api/rapor-sablonlari'
      const res = await fetch(url)
      const json = await res.json()
      
      if (json.ok) {
        setSablonlar(json.data)
      } else {
        toast({ type: 'error', title: 'Hata', message: 'Şablonlar yüklenemedi: ' + json.error })
      }
    } catch (error) {
      toast({ type: 'error', title: 'Hata', message: 'Şablonlar yüklenirken hata oluştu' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    sablonlariYukle()
  }, [projeId])

  // Yeni şablon ekle
  const sablonEkle = async () => {
    if (!formData.ad.trim()) {
      toast({ type: 'error', title: 'Hata', message: 'Şablon adı zorunludur' })
      return
    }

    try {
      const res = await fetch('/api/rapor-sablonlari', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          projeId
        })
      })

      const json = await res.json()
      if (json.ok) {
        toast({ type: 'success', title: 'Başarılı', message: 'Şablon başarıyla eklendi' })
        setYeniSablonAcik(false)
        setFormData({
          ad: '',
          aciklama: '',
          icerik: {
            alanlar: [
              { id: 'gorev_durumu', ad: 'Görev Durumu', tip: 'durum_dagilimi' },
              { id: 'personel_performans', ad: 'Personel Performans', tip: 'tablo' },
            ],
            siralama: ['gorev_durumu', 'personel_performans']
          }
        })
        sablonlariYukle()
      } else {
        toast({ type: 'error', title: 'Hata', message: 'Şablon eklenemedi: ' + json.error })
      }
    } catch (error) {
      toast({ type: 'error', title: 'Hata', message: 'Şablon eklenirken hata oluştu' })
    }
  }

  // Şablon güncelle
  const sablonGuncelle = async (id: string) => {
    if (!formData.ad.trim()) {
      toast({ type: 'error', title: 'Hata', message: 'Şablon adı zorunludur' })
      return
    }

    try {
      const res = await fetch(`/api/rapor-sablonlari/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const json = await res.json()
      if (json.ok) {
        toast({ type: 'success', title: 'Başarılı', message: 'Şablon başarıyla güncellendi' })
        setEditingId(null)
        sablonlariYukle()
      } else {
        toast({ type: 'error', title: 'Hata', message: 'Şablon güncellenemedi: ' + json.error })
      }
    } catch (error) {
      toast({ type: 'error', title: 'Hata', message: 'Şablon güncellenirken hata oluştu' })
    }
  }

  // Şablon sil
  const sablonSil = async (id: string) => {
    if (!confirm('Bu şablonu silmek istediğinizden emin misiniz?')) return

    try {
      const res = await fetch(`/api/rapor-sablonlari/${id}`, {
        method: 'DELETE'
      })

      const json = await res.json()
      if (json.ok) {
        toast({ type: 'success', title: 'Başarılı', message: 'Şablon başarıyla silindi' })
        sablonlariYukle()
      } else {
        toast({ type: 'error', title: 'Hata', message: 'Şablon silinemedi: ' + json.error })
      }
    } catch (error) {
      toast({ type: 'error', title: 'Hata', message: 'Şablon silinirken hata oluştu' })
    }
  }

  // Düzenleme başlat
  const duzenlemeyiBaslat = (sablon: RaporSablonu) => {
    setEditingId(sablon.id)
    setFormData({
      ad: sablon.ad,
      aciklama: sablon.aciklama || '',
      icerik: sablon.icerik
    })
  }

  // Alan ekle
  const alanEkle = () => {
    const yeniAlan = {
      id: `alan_${Date.now()}`,
      ad: 'Yeni Alan',
      tip: 'tablo'
    }
    setFormData(prev => ({
      ...prev,
      icerik: {
        ...prev.icerik,
        alanlar: [...prev.icerik.alanlar, yeniAlan],
        siralama: [...prev.icerik.siralama, yeniAlan.id]
      }
    }))
  }

  // Alan sil
  const alanSil = (alanId: string) => {
    setFormData(prev => ({
      ...prev,
      icerik: {
        ...prev.icerik,
        alanlar: prev.icerik.alanlar.filter(a => a.id !== alanId),
        siralama: prev.icerik.siralama.filter(id => id !== alanId)
      }
    }))
  }

  // Alan güncelle
  const alanGuncelle = (alanId: string, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      icerik: {
        ...prev.icerik,
        alanlar: prev.icerik.alanlar.map(alan => 
          alan.id === alanId ? { ...alan, [field]: value } : alan
        )
      }
    }))
  }

  if (loading) {
    return (
      <div className="verde-card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: '#7a907a', fontSize: 14 }}>Yükleniyor...</div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Başlık ve Ekle Butonu */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f1a0f', fontSize: 20, fontWeight: 700 }}>
            Rapor Şablonları
          </h2>
          <p style={{ margin: '4px 0 0', color: '#7a907a', fontSize: 14 }}>
            Rapor şablonlarınızı yönetin. "Genel Rapor Şablonu" korunmaktadır.
          </p>
        </div>
        <button
          onClick={() => setYeniSablonAcik(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', background: '#2e8b2e', color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontSize: 14, fontWeight: 600
          }}
        >
          <Plus size={16} />
          Yeni Şablon
        </button>
      </div>

      {/* Yeni Şablon Form */}
      {yeniSablonAcik && (
        <div className="verde-card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Yeni Rapor Şablonu</h3>
            <button
              onClick={() => setYeniSablonAcik(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <X size={20} color="#7a907a" />
            </button>
          </div>
          
          <SablonForm
            formData={formData}
            setFormData={setFormData}
            alanEkle={alanEkle}
            alanSil={alanSil}
            alanGuncelle={alanGuncelle}
          />
          
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              onClick={sablonEkle}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', background: '#2e8b2e', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 13, fontWeight: 600
              }}
            >
              <Save size={14} />
              Kaydet
            </button>
            <button
              onClick={() => setYeniSablonAcik(false)}
              style={{
                padding: '6px 12px', background: '#f0f0f0', color: '#666',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 13
              }}
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Şablon Listesi */}
      <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
        {sablonlar.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <FileText size={48} color="#d6e4d6" style={{ marginBottom: 16 }} />
            <div style={{ color: '#7a907a', fontSize: 14, marginBottom: 8 }}>
              Henüz şablon bulunmuyor
            </div>
            <button
              onClick={() => setYeniSablonAcik(true)}
              style={{
                padding: '6px 12px', background: '#2e8b2e', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 13
              }}
            >
              İlk Şablonu Oluştur
            </button>
          </div>
        ) : (
          sablonlar.map((sablon) => (
            <div key={sablon.id} style={{ borderBottom: '1px solid #e8f0e8' }}>
              {editingId === sablon.id ? (
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Şablonu Düzenle</h3>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                    >
                      <X size={20} color="#7a907a" />
                    </button>
                  </div>
                  
                  <SablonForm
                    formData={formData}
                    setFormData={setFormData}
                    alanEkle={alanEkle}
                    alanSil={alanSil}
                    alanGuncelle={alanGuncelle}
                  />
                  
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button
                      onClick={() => sablonGuncelle(sablon.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', background: '#2e8b2e', color: 'white',
                        border: 'none', borderRadius: 6, cursor: 'pointer',
                        fontSize: 13, fontWeight: 600
                      }}
                    >
                      <Save size={14} />
                      Güncelle
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        padding: '6px 12px', background: '#f0f0f0', color: '#666',
                        border: 'none', borderRadius: 6, cursor: 'pointer',
                        fontSize: 13
                      }}
                    >
                      İptal
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#0f1a0f' }}>
                          {sablon.ad}
                        </h3>
                        {sablon.varsayilan && (
                          <span style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', background: '#dcf0dc',
                            border: '1px solid #b8e0b8', borderRadius: 12,
                            fontSize: 11, fontWeight: 600, color: '#1f6b1f'
                          }}>
                            <Lock size={10} />
                            Varsayılan
                          </span>
                        )}
                      </div>
                      {sablon.aciklama && (
                        <p style={{ margin: '0 0 8px', color: '#7a907a', fontSize: 13 }}>
                          {sablon.aciklama}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#a0b4a0' }}>
                        <span>{sablon.icerik.alanlar.length} alan</span>
                        <span>Oluşturuldu: {new Date(sablon.kayit_tarihi).toLocaleDateString('tr-TR')}</span>
                        {sablon.guncelleme_tarihi && (
                          <span>Güncellendi: {new Date(sablon.guncelleme_tarihi).toLocaleDateString('tr-TR')}</span>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!sablon.varsayilan && (
                        <>
                          <button
                            onClick={() => duzenlemeyiBaslat(sablon)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '6px 10px', background: '#f0f9f0',
                              border: '1px solid #d6e4d6', borderRadius: 6,
                              cursor: 'pointer', fontSize: 13, color: '#2d3f2d'
                            }}
                          >
                            <Edit2 size={14} />
                            Düzenle
                          </button>
                          <button
                            onClick={() => sablonSil(sablon.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '6px 10px', background: '#fef2f2',
                              border: '1px solid #fecaca', borderRadius: 6,
                              cursor: 'pointer', fontSize: 13, color: '#dc2626'
                            }}
                          >
                            <Trash2 size={14} />
                            Sil
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Şablon Form Component'i
function SablonForm({ 
  formData, 
  setFormData, 
  alanEkle, 
  alanSil, 
  alanGuncelle 
}: {
  formData: any
  setFormData: (data: any) => void
  alanEkle: () => void
  alanSil: (id: string) => void
  alanGuncelle: (id: string, field: string, value: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#2d3f2d' }}>
          Şablon Adı *
        </label>
        <input
          type="text"
          value={formData.ad}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, ad: e.target.value }))}
          style={{
            width: '100%', padding: '8px 12px',
            border: '1px solid #d6e4d6', borderRadius: 6,
            fontSize: 14
          }}
          placeholder="Rapor şablonu adını girin"
        />
      </div>
      
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#2d3f2d' }}>
          Açıklama
        </label>
        <textarea
          value={formData.aciklama}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, aciklama: e.target.value }))}
          style={{
            width: '100%', padding: '8px 12px',
            border: '1px solid #d6e4d6', borderRadius: 6,
            fontSize: 14, minHeight: 60, resize: 'vertical'
          }}
          placeholder="Şablon açıklamasını girin"
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#2d3f2d' }}>
            Rapor Alanları
          </label>
          <button
            onClick={alanEkle}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', background: '#2e8b2e', color: 'white',
              border: 'none', borderRadius: 4, cursor: 'pointer',
              fontSize: 12
            }}
          >
            <Plus size={12} />
            Alan Ekle
          </button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {formData.icerik.alanlar.map((alan: any) => (
            <div key={alan.id} style={{
              display: 'flex', gap: 8, alignItems: 'center',
              padding: 8, background: '#f8faf8',
              border: '1px solid #e8f0e8', borderRadius: 6
            }}>
              <input
                type="text"
                value={alan.ad}
                onChange={(e) => alanGuncelle(alan.id, 'ad', e.target.value)}
                style={{
                  flex: 1, padding: '4px 8px',
                  border: '1px solid #d6e4d6', borderRadius: 4,
                  fontSize: 13
                }}
                placeholder="Alan adı"
              />
              <select
                value={alan.tip}
                onChange={(e) => alanGuncelle(alan.id, 'tip', e.target.value)}
                style={{
                  padding: '4px 8px', border: '1px solid #d6e4d6',
                  borderRadius: 4, fontSize: 13
                }}
              >
                <option value="tablo">Tablo</option>
                <option value="grafik">Grafik</option>
                <option value="durum_dagilimi">Durum Dağılımı</option>
                <option value="cizgi_grafik">Çizgi Grafik</option>
                <option value="pasta_grafik">Pasta Grafik</option>
              </select>
              <button
                onClick={() => alanSil(alan.id)}
                style={{
                  padding: '4px', background: '#fef2f2',
                  border: '1px solid #fecaca', borderRadius: 4,
                  cursor: 'pointer', color: '#dc2626'
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
