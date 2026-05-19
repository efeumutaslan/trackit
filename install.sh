#!/bin/bash
# TrackIt — First-time install
# WARNING: This script WIPES ALL DATA. Use it only for the very first install.
# To update an existing install, run ./upgrade.sh instead.

set -e

echo "🏋️  TrackIt — First-time install"
echo ""

# Docker check
if ! command -v docker &> /dev/null; then
  echo "❌ Docker not found. Installing..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo ""
  echo "⚠️  Docker group added. Run this command and re-run the script:"
  echo "    newgrp docker"
  exit 1
fi

# docker compose v2 check
if ! docker compose version &> /dev/null; then
  echo "❌ docker compose (v2 plugin) is required."
  echo "   sudo apt-get install -y docker-compose-plugin"
  exit 1
fi

# Volume warning
if docker volume ls --format '{{.Name}}' | grep -q trackit_data; then
  echo "⚠️  Existing trackit_data volume found — ALL DATA WILL BE DELETED."
  read -p "Type 'yes' to continue: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled."
    exit 0
  fi
fi

echo "🛑 Stopping old containers..."
docker compose down -v 2>/dev/null || true

echo "🔨 Building..."
docker compose build

echo "🚀 Starting..."
docker compose up -d

echo ""
echo "⏳ Waiting..."
sleep 6

if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "✅ TrackIt is running: http://localhost:3000"
  echo ""
  echo "📌 Next steps:"
  echo "   1. If Caddy is installed, append the contents of Caddyfile to /etc/caddy/Caddyfile"
  echo "      sudo systemctl reload caddy"
  echo "   2. It will be available at https://track-it.duckdns.org"
else
  echo "⚠️  Health check failed. Inspect the logs:"
  echo "    docker compose logs -f"
fi
