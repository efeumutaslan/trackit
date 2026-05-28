#!/bin/bash
# TrackIt — Weekly DB backup to a private GitHub repo
#
# Setup (one-time, on the server):
#   1. Create a private repo named "trackit-backups" on GitHub.
#   2. Create a fine-grained PAT with:
#        - Repository access: only "trackit-backups"
#        - Repository permissions: Contents = Read and write
#      Save the token to: ~/.trackit-backup-token  (chmod 600)
#   3. Edit BACKUP_REPO below if your GitHub username differs.
#   4. Add this to crontab:
#        0 4 * * 0 /home/ubuntu/trackit/scripts/backup-to-github.sh >> /home/ubuntu/trackit-backup.log 2>&1
#
# What it does:
#   - Pulls the live trackit.db out of the running container
#   - Gzips it (typical compressed size: a few MB even after years of use)
#   - Commits it into a local clone of the backup repo as
#     trackit-YYYY-MM-DD.db.gz
#   - Pushes to GitHub
#
# Restore on a new host:
#   git clone https://github.com/<USER>/trackit-backups.git /tmp/bkp
#   git clone https://github.com/<USER>/trackit.git && cd trackit && ./install.sh
#   docker compose stop app
#   gunzip -c /tmp/bkp/trackit-<DATE>.db.gz > /tmp/restore.db
#   docker compose cp /tmp/restore.db app:/app/data/trackit.db
#   docker compose start app

set -euo pipefail

# --- Configuration ---
BACKUP_USER="efeumutaslan"
BACKUP_REPO="trackit-backups"
PROJECT_DIR="$HOME/trackit"
WORK_DIR="$HOME/.trackit-backup-work"
TOKEN_FILE="$HOME/.trackit-backup-token"
TIMESTAMP=$(date +%Y-%m-%d)
TIMESTAMP_FULL=$(date +%Y-%m-%d_%H%M%S)
# ---------------------

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Sanity checks
if [ ! -f "$TOKEN_FILE" ]; then
  log "ERROR: Token file $TOKEN_FILE not found. See header comment for setup."
  exit 1
fi
TOKEN=$(tr -d '\r\n' < "$TOKEN_FILE")
if [ -z "$TOKEN" ]; then
  log "ERROR: Token file is empty."
  exit 1
fi

# Ensure docker compose is reachable from cron's PATH
export PATH="/usr/local/bin:/usr/bin:/bin"

cd "$PROJECT_DIR" || { log "ERROR: $PROJECT_DIR not found"; exit 1; }

# Quick health check — backup only makes sense if app is running
if ! docker compose ps --status running --services 2>/dev/null | grep -q '^app$'; then
  log "WARNING: app container is not running; attempting backup from volume anyway"
fi

# Step 1: extract the DB
TMP_DB=$(mktemp /tmp/trackit-XXXXXX.db)
log "Extracting database from container..."
if docker compose cp app:/app/data/trackit.db "$TMP_DB" 2>/dev/null; then
  log "  ok (container copy)"
else
  # Fallback: read directly from the named volume
  VOLUME_PATH=$(docker volume inspect trackit_trackit_data --format '{{.Mountpoint}}' 2>/dev/null || true)
  if [ -n "$VOLUME_PATH" ] && [ -f "$VOLUME_PATH/trackit.db" ]; then
    sudo cp "$VOLUME_PATH/trackit.db" "$TMP_DB"
    sudo chown "$(id -u):$(id -g)" "$TMP_DB"
    log "  ok (direct volume read)"
  else
    log "ERROR: could not access trackit.db"
    rm -f "$TMP_DB"
    exit 1
  fi
fi

# Use SQLite's online backup to get a consistent snapshot (avoids WAL races)
SAFE_DB=$(mktemp /tmp/trackit-safe-XXXXXX.db)
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$TMP_DB" ".backup '$SAFE_DB'"
  mv "$SAFE_DB" "$TMP_DB"
fi

DB_SIZE=$(stat -c %s "$TMP_DB" 2>/dev/null || stat -f %z "$TMP_DB")
log "  db size: $DB_SIZE bytes"

# Step 2: gzip
gzip -9 "$TMP_DB"
TMP_GZ="${TMP_DB}.gz"
GZ_SIZE=$(stat -c %s "$TMP_GZ" 2>/dev/null || stat -f %z "$TMP_GZ")
log "  gzipped: $GZ_SIZE bytes"

# Step 3: ensure local clone exists and is current
if [ ! -d "$WORK_DIR/.git" ]; then
  log "Cloning backup repo for the first time..."
  rm -rf "$WORK_DIR"
  git clone --quiet "https://${BACKUP_USER}:${TOKEN}@github.com/${BACKUP_USER}/${BACKUP_REPO}.git" "$WORK_DIR"
  cd "$WORK_DIR"
  git config user.email "trackit-backup@${BACKUP_USER}.local"
  git config user.name "TrackIt Backup"
  # Initialize empty repo if first push
  if [ ! -f README.md ]; then
    echo "# TrackIt DB Backups" > README.md
    echo "" >> README.md
    echo "Automated weekly snapshots of trackit.db. See trackit/scripts/backup-to-github.sh." >> README.md
    git add README.md
    git commit -m "Initialize backup repo" --quiet || true
  fi
else
  cd "$WORK_DIR"
  # Refresh the remote URL with the current token (in case it rotated)
  git remote set-url origin "https://${BACKUP_USER}:${TOKEN}@github.com/${BACKUP_USER}/${BACKUP_REPO}.git"
  git pull --quiet --rebase origin main 2>/dev/null || git pull --quiet --rebase origin master 2>/dev/null || true
fi

# Step 4: copy in and commit
DEST="$WORK_DIR/trackit-${TIMESTAMP}.db.gz"
# If a same-day backup exists already, suffix with HHMMSS to avoid overwriting
if [ -f "$DEST" ]; then
  DEST="$WORK_DIR/trackit-${TIMESTAMP_FULL}.db.gz"
fi
mv "$TMP_GZ" "$DEST"

git add "$(basename "$DEST")"
if git diff --cached --quiet; then
  log "No changes to commit (DB identical to last snapshot)"
else
  git commit -m "backup: $(basename "$DEST") ($GZ_SIZE bytes)" --quiet
  # Try main first, then master, in case the repo's default differs
  if ! git push --quiet origin HEAD 2>/dev/null; then
    log "ERROR: push failed"
    exit 1
  fi
  log "Pushed $(basename "$DEST")"
fi

# Replace token in remote URL with placeholder so it's not lingering on disk
git remote set-url origin "https://github.com/${BACKUP_USER}/${BACKUP_REPO}.git"

log "Done."
