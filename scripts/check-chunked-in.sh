#!/usr/bin/env bash
# Chunk-aware in() checker
#
# Amac: .in('lokasyon_id'/'id', yetkiliLokIds/targetLokasyonIds) gibi
# "BFS yetki scope sonucu" tipi ID listelerinin URL'ye dogrudan yazilmasini
# yakalamak. Musteri rolu tum ust lokasyonlara yetkili olunca
# getYetkiliLokasyonIds ~2000 UUID doner; chunk'siz tek sorgu ~74KB URL
# uretir -> Cloudflare 8KB HTTP request-line limit reject -> fetch failed.
#
# TEHLIKELI isimler (tipik olarak 1000+ UUID):
#   yetkiliLokIds, targetLokasyonIds, allIds (BFS sonucu olanlar)
#
# GUVENLI isimler (bu script'in UYARMADIGI):
#   yetkiliUstLokIds (ust lok ~50)
#   onlineUserIds, baslikIds (bounded)
#   recentXxxIds (bounded)
#
# Beyaz liste: ayni satirda "slice" veya "chunk" varsa gorulmez (zaten chunked).
#
# Kullanim:
#   bash scripts/check-chunked-in.sh
#
# Exit: 0 = temiz, 1 = suphelenilen hit var.

set -euo pipefail

cd "$(dirname "$0")/.."

# Yuksek riskli pattern: BFS sonucu olan ID listelerinin dogrudan .in() icinde
# kullanilmasi. Beyaz liste: ayni satirda slice/chunk geciyorsa skip.
HITS=$(grep -rn -E "\.in\(\s*['\"](lokasyon_id|id|ust_lokasyon_id)['\"]\s*,\s*(yetkiliLokIds|targetLokasyonIds|filters\.yetkiliLokIds|filters\.ustLokasyonAltIds)\b" \
  --include="*.ts" --include="*.tsx" \
  app lib components 2>/dev/null | \
  grep -v -E "(scripts/check-chunked-in|\.slice\(|chunk|CHUNK)" || true)

if [[ -z "$HITS" ]]; then
  echo "[OK] Yuksek riskli chunk'siz .in() pattern bulunamadi."
  exit 0
fi

echo "[UYARI] Asagidaki satirlar BFS yetki scope sonucu ID listesini chunk'siz .in() icinde kullaniyor:"
echo ""
echo "$HITS"
echo ""
echo "Risk: musteri rolunde liste 2000+ UUID olabilir -> URL ~74KB -> Cloudflare 8KB reject -> fetch failed."
echo ""
echo "Cozum pattern:"
echo "  const chunks = ids.length <= 100 ? [ids]"
echo "    : Array.from({length: Math.ceil(ids.length/100)}, (_, i) => ids.slice(i*100, (i+1)*100))"
echo "  for (const slice of chunks) { /* .in(col, slice) */ }"
echo ""
echo "Ornekler: components/dashboard/blocks/CanliIslemlerBlock.tsx, app/api/sidebar-counts/route.ts, lib/reports/genel-rapor-data.ts"
exit 1
