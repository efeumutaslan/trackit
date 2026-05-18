# 🏋️ TrackIt

Antrenman takip uygulaması — workout unit template'leri, exercise roster, renkli takvim, rep-tonnage progress.

## Özellikler

- **Multi-user** — basit kullanıcı adı + şifre auth
- **Workout unit templates** — color-coded, takvimde görünür
- **Exercise roster** — egzersiz başına notlar carry-over, progress chart
- **Session logging** — set/rep/kg, auto start-finish time, workout & exercise notes
- **Notlar carry-over** — aynı template/exercise için önceki session'ın notu otomatik gösterilir
- **Weight adjustment indicator** — ▲ / ▼ ile bir sonraki sefer için hatırlatma
- **Rep-tonnage** — toplam ve önceki session karşılaştırması
- **Renk kodlu takvim** — hangi gün hangi workout yapıldı

## Stack

- **Backend:** Express.js + better-sqlite3 (Node 20)
- **Frontend:** React 18 + Vite + React Router
- **Deploy:** Docker (multi-stage build) + Caddy (HTTPS reverse proxy)
- **Hedef:** Oracle Free Tier Ubuntu 22.04

## Kurulum (Oracle Ubuntu 22.04)

```bash
git clone https://github.com/dejavuhunter/TrackIt.git
cd TrackIt

# İlk kurulum (verileri silebilir)
chmod +x install.sh upgrade.sh
./install.sh

# Caddy kuruluysa HTTPS için:
sudo nano /etc/caddy/Caddyfile
# Caddyfile içeriğini ekle
sudo systemctl reload caddy
```

Uygulama `http://<server-ip>:3000` veya `https://track-it.duckdns.org` üzerinde açılır.

### Güncelleme (verileri korur)

```bash
git pull
./upgrade.sh
```

DB her güncellemede `~/trackit-backups/` altına yedeklenir.

## Geliştirme (lokal)

```bash
# Backend
cd backend
npm install
npm run dev   # http://localhost:3000

# Frontend (ayrı terminal)
cd frontend
npm install
npm run dev   # http://localhost:5173, /api proxy ile backend'e bağlanır
```

## API endpoints

| Path | Method | Açıklama |
|---|---|---|
| `/api/auth/register` | POST | Kayıt |
| `/api/auth/login` | POST | Giriş |
| `/api/auth/me` | GET | Aktif kullanıcı |
| `/api/exercises` | GET/POST | Roster |
| `/api/exercises/:id` | PUT/DELETE | |
| `/api/exercises/:id/progress` | GET | Rep-tonnage geçmiş |
| `/api/templates` | GET/POST | Workout templates |
| `/api/templates/:id` | GET/PUT/DELETE | |
| `/api/sessions` | GET/POST | Sessionlar |
| `/api/sessions/:id` | GET/PUT/DELETE | |
| `/api/sessions/:id/start` | POST | Start time |
| `/api/sessions/:id/finish` | POST | Finish time |
| `/api/sessions/:id/exercises` | POST | Session'a egzersiz ekle |
| `/api/sessions/:id/sets/:setId` | PUT/DELETE | Set güncelle |
| `/api/sessions/:id/save-as-template` | POST | Session'ı template kaydet |
| `/api/sessions/:id/update-template` | POST | Mevcut template'i güncelle |
| `/api/sessions/calendar/:y/:m` | GET | Aylık takvim |

## Lisans

MIT
