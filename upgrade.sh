#!/bin/bash
# TrackIt — Safe upgrade (preserves data)
# Usage: ./upgrade.sh

set -e

echo "🏋️  TrackIt — Upgrade"
echo ""

BACKUP_DIR="$HOME/trackit-backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# DB backup
echo "💾 Backing up database..."
if docker compose ps app --status running &>/dev/null; then
  docker compose cp app:/app/data/trackit.db "$BACKUP_DIR/trackit_$TIMESTAMP.db" 2>/dev/null \
    && echo "   ✅ Backup: $BACKUP_DIR/trackit_$TIMESTAMP.db" \
    || echo "   ⚠️  Backup failed (DB may not exist yet)"
else
  echo "   ⚠️  App is not running — skipping backup"
fi

echo ""
echo "⏹️  Stopping containers (volumes preserved)..."
docker compose down

echo "🔨 Rebuilding..."
docker compose up -d --build

echo ""
echo "⏳ Waiting..."
sleep 6

if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "✅ TrackIt upgraded: http://localhost:3000"
  echo ""
  echo "📦 Backups: $BACKUP_DIR/"
  ls -lh "$BACKUP_DIR/" 2>/dev/null | tail -5
else
  echo "⚠️  Health check failed. Inspect the logs:"
  echo "    docker compose logs -f"
fi
