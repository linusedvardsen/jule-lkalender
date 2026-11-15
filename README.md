# Juleølkalender (Self-Hosted Video Advent Calendar)

A lightweight, containerized **Juleølkalender** with a festive Christmas UI, Unlisted YouTube embed support (`youtube-nocookie.com`), and **server-enforced** `06:00` (`Europe/Oslo`) door unlocking.

Locked doors never leak future YouTube URLs to the browser—all video links live in a private, gitignored `data/calendar.json` file that is filtered by the backend API before reaching Nginx.

---

## Architecture

```text
Internet / Browser
        │  HTTP (e.g. http://<PUBLIC_IP> or http://<PUBLIC_IP>:8080)
        ▼
  Home Router / VPS Firewall (Port Forward TCP 80/8080 -> <LAN_IP>:8080)
        │
        ▼
  [web: nginx:alpine]  (host port ${HOST_PORT:-8080} -> container :80)
        ├── Static UI (/usr/share/nginx/html <- ./public)
        └── /api/calendar ──(internal bridge)──► [api: node:22-alpine] (:3000)
                                                       └── reads ./data/calendar.json (gitignored)
```

- **`web` (`nginx:alpine`)**: Serves the static frontend (`public/`), proxies `/api/calendar` with `Cache-Control: no-store`, sets security/referrer headers required for YouTube embeds, and applies basic request/connection rate limiting.
- **`api` (`node:22-alpine`)**: Zero-dependency Node server checking the real server clock in `Europe/Oslo`. Each door unlocks at `06:00` on its December date; future `videoUrl` values are replaced with `null` until unlocked.

---

## Directory Structure

```text
.
├── .env.example
├── .gitignore
├── README.md
├── docker-compose.yml
├── api/
│   └── server.js
├── data/
│   └── calendar.example.json
├── nginx/
│   └── nginx.conf
└── public/
    ├── css/
    │   └── style.css
    ├── index.html
    ├── js/
    │   └── app.js
    └── videos/
        └── .gitkeep
```

---

## Quick Start on Your Linux Server

1. **Clone the repository**
   ```bash
   git clone https://github.com/linusedvardsen/jule-lkalender.git
   cd jule-lkalender
   ```

2. **Create your private calendar config**
   ```bash
   cp data/calendar.example.json data/calendar.json
   ```
   *(If you skip this step, the API falls back to `data/calendar.example.json`. `data/calendar.json` is listed in `.gitignore` so your Unlisted YouTube links stay private on your server and are never pushed to GitHub or overwritten by `git pull`.)*

3. **Start the containers** (defaults to host port `8080`):
   ```bash
   docker compose up -d
   ```
   *(Optional)* If port `80` is free on your Linux server and you prefer Docker directly on port `80`:
   ```bash
   cp .env.example .env
   # Edit .env and set HOST_PORT=80
   docker compose up -d
   ```

4. **Verify locally on the server**
   ```bash
   docker compose ps
   docker compose exec web nginx -t
   curl -I http://localhost:8080
   curl -s http://localhost:8080/api/calendar | head -c 300
   ```

---

## Adding Unlisted YouTube Videos (Hidden Until 06:00 on the Date)

1. Upload each day's clip to YouTube with visibility set to **Unlisted** (hidden from search and your channel feed while remaining embeddable).
2. On your Linux server, edit `data/calendar.json` and paste each YouTube link (`https://youtu.be/...`, `https://www.youtube.com/watch?v=...`, or `/shorts/...`) into that day's `"videoUrl"`:
   ```json
   {
     "day": 1,
     "title": "Luke 1",
     "videoUrl": "https://youtu.be/YOUR_VIDEO_ID",
     "unlocked": false
   }
   ```
3. Changes to `data/calendar.json` take effect immediately (no container restart needed).
4. **How unlocking works**:
   - Controlled exclusively on the server using `Europe/Oslo` time (`"unlockHour": 6`, `"year": 2026`).
   - Visitors cannot unlock future doors by changing their phone/PC clock, passing URL parameters, or inspecting network requests—`videoUrl` remains `null` in `/api/calendar` until `06:00` Oslo time on that day.
   - *(Admin testing only)* You can temporarily add `"demoDate": "2026-12-10T12:00"` inside `data/calendar.json` on the server to preview December 10, then remove that line before sharing the site.

---

## Home Router & Public IP Setup

1. **Confirm no CGNAT**: Check `curl -4 ifconfig.me` on the server and verify your router's **WAN IPv4** matches it.
2. **Reserve your server's LAN IP**: Pin `hostname -I` (e.g. `192.168.1.117`) in your router's **Static DHCP Lease** settings.
3. **Port forwarding**: Forward TCP external port `80` (for `http://<PUBLIC_IP>`) or `8080` (for `http://<PUBLIC_IP>:8080`) to `<SERVER_LAN_IP>:8080`.
4. **Test**: Open `http://<PUBLIC_IP>` from a phone on 4G/5G mobile data (Wi-Fi off).

---

## Managing & Updating

```bash
# View logs
docker compose logs -f

# Pull latest updates without touching private data/calendar.json
git pull
docker compose up -d

# Stop the stack
docker compose down
```
