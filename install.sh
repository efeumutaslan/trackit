#!/bin/bash
# TrackIt — İlk Kurulum
# ⚠️ DİKKAT: Bu script TÜM VERİLERİ SİLER. Sadece ilk kurulumda kullan.
# Mevcut kurulumu güncellemek için: ./upgrade.sh

set -e

echo "🏋️  TrackIt — İlk Kurulum"
echo ""

# Docker var mı kontrol et
if ! command -v docker &> /dev/null; then
  echo "❌ Docker bulunamadı. Kuruluyor..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo ""
  echo "⚠️  Docker grubu eklendi. Şu komutu çalıştır ve script'i tekrar dene:"
  echo "    newgrp docker"
  exit 1
fi

# docker compose v2 kontrolü
if ! docker compose version &> /dev/null; then
  echo "❌ docker compose (v2 plugin) gerekli."
  echo "   sudo apt-get install -y docker-compose-plugin"
  exit 1
fi

# Volume varsa uyar
if docker volume ls --format '{{.Name}}' | grep -q trackit_data; then
  echo "⚠️  Mevcut trackit_data volume bulundu — TÜM VERİLER SİLİNECEK."
  read -p "Devam etmek için 'evet' yaz: " CONFIRM
  if [ "$CONFIRM" != "evet" ]; then
    echo "İptal edildi."
    exit 0
  fi
fi

echo "🛑 Eski container'ları durdur..."
docker compose down -v 2>/dev/null || true

echo "🔨 Build ediliyor..."
docker compose build

echo "🚀 Başlatılıyor..."
docker compose up -d

echo ""
echo "⏳ Bekleniyor..."
sleep 6

if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "✅ TrackIt çalışıyor: http://localhost:3000"
  echo ""
  echo "📌 Sonraki adımlar:"
  echo "   1. Caddy kuruluysa Caddyfile içeriğini /etc/caddy/Caddyfile dosyasına ekle"
  echo "      sudo systemctl reload caddy"
  echo "   2. https://track-it.duckdns.org adresinden açılacak"
else
  echo "⚠️  Sağlık kontrolü başarısız. Logları kontrol et:"
  echo "    docker compose logs -f"
fi
