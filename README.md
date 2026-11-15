# Self-Hosted Video Advent Calendar

A lightweight, containerized **Video Advent Calendar** designed to run on a headless Linux server using **Nginx** and **Cloudflare Tunnel** (`cloudflared`).

All traffic enters securely through Cloudflare Zero Trust over an outbound tunnel; the web container publishes **no host ports** and is reachable only on an isolated Docker bridge network.

---

## Architecture

```text
Internet / Browser
        │  HTTPS
        ▼
  Cloudflare Edge
        │  Encrypted Outbound Tunnel
        ▼
 [tunnel: cloudflared] ──(HTTP://web:80 over advent-internal bridge)──► [web: nginx:alpine]
                                                                            ├── /usr/share/nginx/html (./public)
                                                                            └── /etc/nginx/nginx.conf
```

- **`web` (`nginx:alpine`)**: Serves the static frontend (`public/`), calendar manifest (`public/data/calendar.json`), and MP4/WebM clips (`public/videos/`) with `sendfile`, `tcp_nopush`, byte-range seeking (`Accept-Ranges: bytes` / `206 Partial Content`), cache differentiation, and security headers.
- **`tunnel` (`cloudflare/cloudflared:latest`)**: Authenticates with `CLOUDFLARE_TUNNEL_TOKEN` and proxies public HTTPS requests to `http://web:80` over the shared Docker bridge network.

---

## Directory Structure

```text
.
├── .env.example
├── .gitignore
├── README.md
├── docker-compose.local.yml
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

- **Linux server** (headless) with:
  - [Docker Engine](https://docs.docker.com/engine/install/)
  - [Docker Compose v2 plugin](https://docs.docker.com/compose/install/) (`docker compose`)
- **Cloudflare account** with an active **managed domain** (DNS hosted on Cloudflare) and **Cloudflare Zero Trust** enabled (free tier works).

---

## Cloudflare Zero Trust Setup

1. **Create the Tunnel**
   - Sign in to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
   - Navigate to **Networks** &rarr; **Tunnels** &rarr; **Create a tunnel**.
   - Select **Cloudflared** as the connector type, give the tunnel a name (e.g., `advent-calendar`), and click **Save tunnel**.

2. **Copy the Tunnel Token into `.env`**
   - Under **Install and run a connector**, locate the Docker/Linux command containing `--token <YOUR_TOKEN>`.
   - Copy only the token string (starting with `eyJ...`).
   - On your server in the repository root, create `.env` from `.env.example` and paste the token:
     ```bash
     cp .env.example .env
     ```
     Edit `.env`:
     ```dotenv
     CLOUDFLARE_TUNNEL_TOKEN=eyJ...your-token-here...
     ```
   - Lock down permissions on `.env` if desired:
     ```bash
     chmod 600 .env
     ```

3. **Configure the Public Hostname**
   - In the tunnel configuration, open the **Public Hostname** tab and click **Add a public hostname**.
   - Set **Subdomain** and **Domain** (e.g., `advent.example.com`).
   - Under **Service**:
     - **Type**: `HTTP`
     - **URL**: `web:80` (resulting in `HTTP://web:80`)
   - Save the hostname.
   - Ensure your Cloudflare zone's SSL/TLS encryption mode handles HTTPS at the edge (do **not** add an HTTP-to-HTTPS redirect inside `nginx.conf`, as `cloudflared` connects to `http://web:80` internally).

---

## Adding Video Media

Place your daily clips in `public/videos/` matching the paths in `public/data/calendar.json`:

```text
public/videos/day-01.mp4
public/videos/day-02.mp4
...
public/videos/day-24.mp4
```

> **Note:** Video files in `public/videos/` (except `.gitkeep`) are excluded by `.gitignore` so large media binaries are never committed to Git. Transfer them directly to the server using `scp` or `rsync`.

For fast startup and smooth browser scrubbing over MP4, ensure the `moov` atom is placed at the start of each file when encoding with `ffmpeg`:

```bash
ffmpeg -i input.mov -c:v libx264 -c:a aac -movflags +faststart public/videos/day-01.mp4
```

### Embedding Unlisted YouTube Videos

Upload clips to YouTube with visibility set to **Unlisted** (hidden from YouTube search and your channel page while remaining embeddable) and paste any standard YouTube link into `videoUrl` in `public/data/calendar.json`:

```json
{
  "day": 1,
  "title": "Day 1",
  "videoUrl": "https://youtu.be/YOUR_VIDEO_ID",
  "unlocked": false
}
```

- Supported formats (`youtube.com/watch?v=...`, `youtu.be/...`, `/shorts/...`, `/live/...`, `/embed/...`) are automatically embedded via `https://www.youtube-nocookie.com/embed/<ID>?rel=0`.
- Keep `Referrer-Policy "strict-origin-when-cross-origin"` in `nginx/nginx.conf` so YouTube embeds receive the origin `Referer` they expect.

---

## Running & Managing the Stack

### Start in Detached Mode

```bash
docker compose up -d
```

### Check Container Status & Health

```bash
docker compose ps
```

### Inspect Logs

```bash
# All services
docker compose logs -f

# Cloudflare Tunnel connector logs (verify connection to Cloudflare Edge)
docker compose logs -f tunnel

# Nginx access & error logs
docker compose logs -f web
```

### Stop or Restart the Stack

```bash
docker compose down
docker compose restart
```

---

## Local Browser Preview (Without Cloudflare Tunnel)

To preview the site locally in Docker on `http://localhost:8080` (and from mobile devices on your LAN via `http://<your-lan-ip>:8080`) without setting up a Cloudflare Tunnel token, use the dedicated local Compose file:

```bash
docker compose -f docker-compose.local.yml up
```

> **Note:** Keep `docker-compose.yml` for production deployments behind Cloudflare Tunnel. `docker-compose.local.yml` exists separately so host port `8080` is never accidentally published in production.

### Previewing Specific December Dates

- `public/data/calendar.json` currently includes `"demoDate": "2026-12-10"` so doors 1–10 appear unlocked (with Day 10 highlighted as **Today**) and doors 11–24 remain locked.
- Remove `"demoDate"` from `public/data/calendar.json` when deploying live so doors unlock according to the visitor's system clock in December.
- You can also override the date via query string at any time: `?date=2026-12-15` (simulate Dec 15) or `?date=live` (use current date).

---

## Testing Locally (Without Publishing Host Ports)

Because `web` intentionally uses `expose: ["80"]` instead of `ports:`, port `80` is not bound on the host interface. Use the commands below to verify the stack internally:

1. **Validate Nginx configuration syntax**
   ```bash
   docker compose exec web nginx -t
   ```

2. **Check HTTP responses inside the `web` container**
   ```bash
   docker compose exec web wget -S -O /dev/null http://127.0.0.1/
   docker compose exec web wget -S -O /dev/null http://127.0.0.1/data/calendar.json
   ```

3. **Verify byte-range streaming (`Accept-Ranges: bytes` / `206 Partial Content`) over the internal bridge network**

   Once a test video exists at `public/videos/day-01.mp4`, attach a temporary `curl` container to the Compose bridge network (`<project>_advent-internal`; check exact name with `docker network ls`):
   ```bash
   NETWORK_NAME=$(docker network ls --filter name=advent-internal --format '{{.Name}}' | head -n 1)

   # Verify Accept-Ranges and caching/security headers
   docker run --rm --network "$NETWORK_NAME" curlimages/curl -I http://web:80/videos/day-01.mp4

   # Verify HTTP 206 Partial Content byte-range response
   docker run --rm --network "$NETWORK_NAME" curlimages/curl -I -r 0-1023 http://web:80/videos/day-01.mp4
   ```

4. **Test video playback in the browser**
   - Temporarily set `"unlocked": true` for day 1 in `public/data/calendar.json` and ensure `public/videos/day-01.mp4` exists.
   - Visit your Cloudflare Public Hostname (`https://advent.example.com`) and click **Day 1** to verify video playback and timeline scrubbing.
