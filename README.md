# 🏋️ TrackIt

A workout tracking app — workout-unit templates, exercise roster, color-coded calendar, rep-tonnage progress.

## Features

- **Multi-user** — simple username + password auth
- **Workout-unit templates** — color-coded, visible on the calendar
- **Exercise roster** — per-exercise notes carry-over, progress chart
- **Session logging** — sets/reps/kg, auto start-finish time, workout & exercise notes
- **Notes carry-over** — for the same template/exercise, the previous session's notes are shown automatically
- **Weight adjustment indicator** — ▲ / ▼ reminder for next time
- **Rep-tonnage** — total and previous-session comparison
- **Color-coded calendar** — see at a glance which workout was done on which day

## Stack

- **Backend:** Express.js + better-sqlite3 (Node 20)
- **Frontend:** React 18 + Vite + React Router
- **Deploy:** Docker (multi-stage build) + Caddy (HTTPS reverse proxy)
- **Target:** Oracle Free Tier Ubuntu 22.04

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

The app is available at `http://<server-ip>:3000` or `https://track-it.duckdns.org`.

### Upgrade (preserves data)

```bash
git pull
./upgrade.sh
```

The DB is backed up to `~/trackit-backups/` on every upgrade.

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

| Path | Method | Description |
|---|---|---|
| `/api/auth/register` | POST | Register |
| `/api/auth/login` | POST | Sign in |
| `/api/auth/me` | GET | Current user |
| `/api/exercises` | GET/POST | Roster |
| `/api/exercises/:id` | PUT/DELETE | |
| `/api/exercises/:id/progress` | GET | Rep-tonnage history |
| `/api/templates` | GET/POST | Workout templates |
| `/api/templates/:id` | GET/PUT/DELETE | |
| `/api/sessions` | GET/POST | Sessions |
| `/api/sessions/:id` | GET/PUT/DELETE | |
| `/api/sessions/:id/start` | POST | Start time |
| `/api/sessions/:id/finish` | POST | Finish time |
| `/api/sessions/:id/exercises` | POST | Add an exercise to a session |
| `/api/sessions/:id/sets/:setId` | PUT/DELETE | Update a set |
| `/api/sessions/:id/save-as-template` | POST | Save session as a new template |
| `/api/sessions/:id/update-template` | POST | Update the attached template |
| `/api/sessions/calendar/:y/:m` | GET | Monthly calendar feed |

## License

MIT
