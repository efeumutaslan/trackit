# 🏋️ TrackIt

A mobile-first workout-tracking PWA — reusable workout templates, an
exercise roster, a color-coded calendar, bodyweight tracking, and
rep-tonnage progress. Light/dark themes, optional features you can turn
on or off, and a desktop layout with a sidebar.

## Features

### Training
- **Workout templates** — reusable, color-coded, shown on the calendar. Duplicate, edit, or save a finished session as a new template.
- **Exercise roster** — strength or cardio type (drives the icon), optional groups, per-exercise notes, and a progress chart.
- **A/B alternate exercises** — give a template exercise a primary (A) and an alternate (B); switch sides per session with side-aware notes and prefill.
- **Session logging** — sets / reps / kg, per-set bumpers with a configurable weight increment, superset tags, target rep range, target time/distance for cardio, and per-exercise + per-workout notes.
- **Notes carry-over** — the previous session's note for the same template/exercise is shown automatically.
- **Weight adjustment indicator** — ▲ / ▼ buttons to flag "go heavier / back off"; the choice tints the exercise card with a bright neon green/red wash on the next session.
- **Rep-tonnage** — per-exercise total volume with a previous-session comparison.
- **Rest timer** — configurable countdown between sets, with optional sound and vibration.

### Tracking & overview
- **Color-coded calendar** — month grid + year heatmap; each day shows the template colour, with a badge when more than one workout was logged.
- **Bodyweight** — log weight with optional notes and an honest line/area trend chart.
- **CSV import / export** — export one row per set; import is additive and never overwrites existing data.

### Personalization (Settings)
- **Appearance** — System / Light / Dark theme. "System" follows the device's `prefers-color-scheme`; the choice is stored per-user and mirrored to `localStorage` so it applies instantly with no flash.
- **Optional features** — toggle Rest timer, Bodyweight, the ▲▼ indicator, the previous-exercise note, Tonnage, and the home calendar; disabling one removes its UI entirely.
- **Rep input placeholder** — keep empty or show the previous session's reps.
- **Weight increment** — 1.25 / 2.5 / 5 kg or a custom step for the +/- bumpers.

### Platform
- **Multi-user** — username + password auth, with "sign out of all devices".
- **Mobile-first PWA** with a bottom nav; on desktop (≥1024px) a sidebar appears and the content fills the wider screen.
- **Consistent dates** — dd.mm.yyyy everywhere, independent of device locale.

## Stack

- **Backend:** Express.js 4 + better-sqlite3 (Node 20)
- **Frontend:** React 18 + Vite 5 + React Router
- **Deploy:** Docker (multi-stage build) + Caddy (HTTPS reverse proxy)
- **Target:** Oracle Free Tier, Ubuntu 22.04

Schema changes are applied automatically on server start via idempotent
`addCol()` migrations, so upgrades preserve existing data and settings.

## Install (Oracle Ubuntu 22.04)

```bash
git clone https://github.com/efeumutaslan/trackit.git
cd trackit

# First-time install (may wipe data)
chmod +x install.sh upgrade.sh
./install.sh

# For HTTPS via Caddy:
sudo nano /etc/caddy/Caddyfile
# Append the contents of Caddyfile
sudo systemctl reload caddy
```

The app is available at `http://<server-ip>:3000` or `https://trackit-demo.duckdns.org`.

### Upgrade (preserves data)

```bash
git pull
./upgrade.sh
```

Or the manual Docker flow:

```bash
git pull && docker compose down && docker compose build --no-cache && docker compose up -d
```

The DB is backed up to `~/trackit-backups/` on every upgrade.

> After a frontend change, clear the iOS Safari / installed-PWA cache once so the new assets load. Cache headers handle subsequent deploys automatically.

## Off-host backups (weekly to a private GitHub repo)

`scripts/backup-to-github.sh` snapshots the live DB, gzips it, and pushes
it into a second private GitHub repo. This way, if the entire server (or
the Oracle Free Tier itself) disappears, the data is recoverable from
GitHub.

One-time setup on the server:

1. On GitHub, create a **private** repo called `trackit-backups`.
2. Create a **fine-grained PAT**:
   - Repository access: only `trackit-backups`
   - Repository permissions: **Contents = Read and write**
3. Save the token to the server, locked down:
   ```bash
   echo 'ghp_xxx...' > ~/.trackit-backup-token
   chmod 600 ~/.trackit-backup-token
   ```
4. Add a weekly cron job (Sundays at 04:00):
   ```bash
   crontab -e
   # then add:
   0 4 * * 0 /home/ubuntu/trackit/scripts/backup-to-github.sh >> /home/ubuntu/trackit-backup.log 2>&1
   ```
5. Optional first manual run to verify:
   ```bash
   ./scripts/backup-to-github.sh
   ```

Restore on a fresh host:

```bash
git clone https://github.com/<USER>/trackit-backups.git /tmp/bkp
git clone https://github.com/<USER>/trackit.git && cd trackit
./install.sh
docker compose stop app
gunzip -c /tmp/bkp/trackit-<DATE>.db.gz > /tmp/restore.db
docker compose cp /tmp/restore.db app:/app/data/trackit.db
docker compose start app
```

## Local development

```bash
# Backend
cd backend
npm install
npm run dev   # http://localhost:3000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to the backend
```

## API endpoints

All endpoints except `/api/auth/register` and `/api/auth/login` require a
`Authorization: Bearer <token>` header. Every record is scoped to the
authenticated user.

### Auth
| Path | Method | Description |
|---|---|---|
| `/api/auth/register` | POST | Register |
| `/api/auth/login` | POST | Sign in |
| `/api/auth/logout` | POST | Sign out (this device) |
| `/api/auth/logout-all` | POST | Sign out of all devices |
| `/api/auth/me` | GET | Current user |

### Exercises & groups
| Path | Method | Description |
|---|---|---|
| `/api/exercises` | GET/POST | Roster (POST accepts `kind`: strength/cardio) |
| `/api/exercises/:id` | PUT/DELETE | Update / remove |
| `/api/exercises/:id/last-note` | GET | Most recent note for this exercise |
| `/api/exercises/:id/progress` | GET | Rep-tonnage history |
| `/api/groups` | GET/POST | Exercise groups |
| `/api/groups/:id` | PUT/DELETE | Rename / remove |
| `/api/groups/:id/exercises` | GET | Exercises in a group |

### Templates
| Path | Method | Description |
|---|---|---|
| `/api/templates` | GET/POST | Workout templates |
| `/api/templates/:id` | GET/PUT/DELETE | |
| `/api/templates/:id/clone` | POST | Duplicate a template |
| `/api/templates/:id/last-note` | GET | Previous workout note |

### Sessions
| Path | Method | Description |
|---|---|---|
| `/api/sessions` | GET/POST | List / create |
| `/api/sessions/:id` | GET/PUT/DELETE | |
| `/api/sessions/:id/start` | POST | Set start time |
| `/api/sessions/:id/finish` | POST | Set finish time |
| `/api/sessions/:id/exercises` | POST | Add an exercise |
| `/api/sessions/:id/exercises/:seId` | PUT/DELETE | Update / remove a session exercise |
| `/api/sessions/:id/exercises/:seId/move` | POST | Reorder |
| `/api/sessions/:id/exercises/:seId/replace` | POST | Swap the exercise |
| `/api/sessions/:id/exercises/:seId/sets` | POST | Add a set |
| `/api/sessions/:id/sets/:setId` | PUT/DELETE | Update / remove a set |
| `/api/sessions/:id/save-as-template` | POST | Save session as a new template |
| `/api/sessions/:id/update-template` | POST | Update the attached template |
| `/api/sessions/calendar/:year/:month` | GET | Monthly calendar feed |

### Bodyweight, CSV & settings
| Path | Method | Description |
|---|---|---|
| `/api/bodyweight` | GET/POST | Log entries |
| `/api/bodyweight/:id` | DELETE | Remove an entry |
| `/api/bodyweight/latest` | GET | Most recent weight |
| `/api/csv/export` | GET | Export all data as CSV |
| `/api/csv/import` | POST | Import (additive) |
| `/api/settings` | GET/PUT | Theme, feature toggles, rep placeholder, weight increment, rest-timer prefs |

## License

MIT
