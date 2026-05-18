#!/bin/bash
# TrackIt — Güvenli Güncelleme (verileri korur)
# Kullanım: ./upgrade.sh

set -e

echo "🏋️  TrackIt Güncelleme"
echo ""

BACKUP_DIR="$HOME/trackit-backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# DB yedeği
echo "💾 Veritabanı yedekleniyor..."
if docker compose ps app --status running &>/dev/null; then
  docker compose cp app:/app/data/trackit.db "$BACKUP_DIR/trackit_$TIMESTAMP.db" 2>/dev/null \
    && echo "   ✅ Yedek: $BACKUP_DIR/trackit_$TIMESTAMP.db" \
    || echo "   ⚠️  Yedek alınamadı (DB henüz oluşmamış olabilir)"
else
  echo "   ⚠️  App çalışmıyor — yedek atlandı"
fi

echo ""
echo "⏹️  Container'lar durduruluyor (volume'lar korunuyor)..."
docker compose down

echo "🔨 Yeniden build ediliyor..."
docker compose up -d --build

echo ""
echo "⏳ Bekleniyor..."
sleep 6

if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "✅ TrackIt güncellendi: http://localhost:3000"
  echo ""
  echo "📦 Yedekler: $BACKUP_DIR/"
  ls -lh "$BACKUP_DIR/" 2>/dev/null | tail -5
else
  echo "⚠️  Sağlık kontrolü başarısız. Logları kontrol et:"
  echo "    docker compose logs -f"
fi
