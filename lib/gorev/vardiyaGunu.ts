// Sarkan vardiya (örn V1 23:30-07:30) destekli "şu an içinde olduğumuz vardiya günü" hesabı.
// Normal saatlerde TR takvim günü dönülür. Saat sarkan vardiyanın akşam yarısındaysa
// (örn 23:30+) vardiya yarının vardiya_gunu'na ait olduğu için +1 gün dönülür.

export type VardiyaAyar = { no: number; baslangic: string; bitis: string }

export function suankiVardiyaGunu(vardiyaAyari: VardiyaAyar[]): string {
  const now = new Date()
  const trDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
  if (!vardiyaAyari?.length) return trDate
  const trSaat = now.toLocaleTimeString('tr-TR', {
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
