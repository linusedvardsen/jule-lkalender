# Self-Hosted Video Advent Calendar

A lightweight, containerized **Video Advent Calendar** with a festive Christmas UI, Unlisted YouTube embed support (`youtube-nocookie.com`), and date-based door unlocking—configured to run via **Nginx** in Docker with direct IP access.

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
        ├── /usr/share/nginx/html  (./public)
        └── /etc/nginx/nginx.conf  (./nginx/nginx.conf)
```

- **`web` (`nginx:alpine`)**: Serves the static frontend (`public/`), calendar manifest (`public/data/calendar.json`), security/referrer headers required for YouTube embeds, and basic request/connection rate limiting for direct internet exposure.

---

## Directory Structure

```text
.
├── .env.example
├── .gitignore
├── README.md
├── docker-compose.yml
├── nginx/
│   └── nginx.conf
└── public/
    ├── css/
    │   └── style.css
    ├── data/
    │   └── calendar.json
    ├── index.html
    ├── js/
    │   └── app.js
    └── videos/
        └── .gitkeep
```

---

## Prerequisites

- **Linux server** with:
  - [Docker Engine](https://docs.docker.com/engine/install/)
  - [Docker Compose v2 plugin](https://docs.docker.com/compose/install/) (`docker compose`)
- **Public IPv4 connectivity** (either a Cloud VPS public IP, or a home router with a real public IPv4—not ISP CGNAT—and port forwarding configured).

---

## Quick Start on Your Linux Server

1. **Clone the repository**
   ```bash
   git clone https://github.com/linusedvardsen/jule-lkalender.git
   cd jule-lkalender
   ```

2. **Start the container** (defaults to host port `8080` so it won't clash with anything on port `80`, no `.env` required):
   ```bash
   docker compose up -d
   ```
   *(Optional)* If port `80` is free on your Linux server and you prefer Docker to listen directly on port `80`:
   ```bash
   cp .env.example .env
   # Edit .env and set HOST_PORT=80
   docker compose up -d
   ```

3. **Verify locally on the server**
   ```bash
   docker compose ps
   docker compose exec web nginx -t
   curl -I http://localhost:8080
   ```

4. **Allow the host port in your Linux firewall (if `ufw` is active)**
   ```bash
   sudo ufw status
   sudo ufw allow 8080/tcp
   ```

---

## Home Router & Public IP Setup

If hosting from a home Linux server instead of a VPS:

1. **Confirm you are not behind CGNAT**
   - Check your public IPv4 on the server:
     ```bash
     curl -4 ifconfig.me
     ```
   - Log into your router (gateway from `ip route | grep default`, e.g. `http://192.168.1.1`) and check its **WAN IPv4 address**:
     - If it **matches** `curl -4 ifconfig.me`, port forwarding will work.
     - If it starts with `100.64.`–`100.127.` (CGNAT), contact your ISP to request a public IPv4.
     - If it starts with `192.168.`, `10.`, or `172.16.`–`172.31.`, you have double NAT (enable Bridge Mode on the upstream modem or forward both routers).

2. **Reserve your server's LAN IP**
   - Run `hostname -I` on the server to get its LAN IP (e.g. `192.168.1.117`).
   - Add a **DHCP Static Lease / IP Reservation** in your router for that server so its LAN IP never changes.

3. **Forward the port on your router**
   - **Protocol**: `TCP`
   - **External Port**: `80` (clean URL `http://<PUBLIC_IP>`) or `8080` (use `8080` if your ISP blocks inbound port `80`)
   - **Internal IP**: your server's LAN IP (e.g. `192.168.1.117`)
   - **Internal Port**: `8080` (or `80` if you set `HOST_PORT=80` in `.env`)

4. **Test from outside your home Wi-Fi**
   - Turn off Wi-Fi on your phone (use 4G/5G mobile data) and open `http://<PUBLIC_IP>` (or `http://<PUBLIC_IP>:8080`).

---

## Adding Unlisted YouTube Videos & Going Live

1. Upload each day's clip to YouTube with visibility set to **Unlisted** (hidden from YouTube search and your channel page while remaining embeddable).
2. Paste each YouTube link (`https://youtu.be/...`, `https://www.youtube.com/watch?v=...`, or `/shorts/...`) into `videoUrl` in `public/data/calendar.json`:
   ```json
   {
     "day": 1,
     "title": "Day 1",
     "videoUrl": "https://youtu.be/YOUR_VIDEO_ID",
     "unlocked": false
   }
   ```
3. **Demo date vs. live December clock**:
   - `public/data/calendar.json` currently sets `"demoDate": "2026-12-10"` so doors 1–10 appear unlocked for previewing.
   - Remove `"demoDate"` when you want doors to unlock based on the visitor's real December date (you can still preview any date via `?date=2026-12-15` or `?date=live`).
   - Keep `Referrer-Policy "strict-origin-when-cross-origin"` in `nginx/nginx.conf` so YouTube embeds receive the origin `Referer` header.

---

## Managing & Updating

```bash
# View container logs
docker compose logs -f

# Pull latest Git changes and reload static files
git pull
docker compose up -d

# Stop the container
docker compose down
```
