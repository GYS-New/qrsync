// Sarkan vardiya (örn V1 23:30-07:30) destekli "verilen zamanın ait olduğu vardiya günü"
// hesabı. Normal saatlerde TR takvim günü dönülür. Saat sarkan vardiyanın akşam
// yarısındaysa (örn 23:30+) görevin ait olduğu gün YARIN (vardiya_gunu = +1) olur.

export type VardiyaAyar = { no: number; baslangic: string; bitis: string }

// Genel hesap: baseIso verilirse o zamanın, verilmezse şu anın vardiya günü
export function vardiyaGunuHesapla(vardiyaAyari: VardiyaAyar[], baseIso?: string): string {
  const t = baseIso ? new Date(baseIso) : new Date()
  const trDate = t.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
  if (!vardiyaAyari?.length) return trDate
  const trSaat = t.toLocaleTimeString('tr-TR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Istanbul',
  })
  for (const v of vardiyaAyari) {
    const sarkan = v.bitis <= v.baslangic
    if (sarkan && trSaat >= v.baslangic) {
      // Saat sarkan vardiyanın akşam yarısında → görevin ait olduğu gün YARIN
      const d = new Date(trDate + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + 1)
      return d.toISOString().slice(0, 10)
    }
  }
  return trDate
}

// Geriye dönük uyumluluk — "şu anki" vardiya günü
export const suankiVardiyaGunu = (vardiyaAyari: VardiyaAyar[]): string =>
  vardiyaGunuHesapla(vardiyaAyari)
