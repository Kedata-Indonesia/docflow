# Deployment Guide — DocsEditor

## Deployment Modes

DocsEditor supports two deployment modes:

| Mode | Frontend | Backend API | Best For |
|------|----------|-------------|----------|
| **Same-domain** | `https://docs.example.com` | `https://docs.example.com/api/*` | Simplest setup; single SSL cert; works with default cookie settings. |
| **Separate-domain** | `https://app.example.com` | `https://api.example.com` | Microservices/headless API; requires cross-domain OAuth config. |

---

## Same-Domain Architecture

```
                     ┌──────────────┐
  HTTPS :443 ───────→│   nginx      │
                     │  (reverse    │
                     │   proxy)     │
                     └─┬─────────┬──┘
                       │         │
                  /api/*    static files
                       │         │
                 ┌─────▼──┐ ┌────▼────┐
                 │ server │ │  demo   │
                 │ :3001  │ │  (cdn)  │
                 └───┬────┘ └─────────┘
                     │
                ┌────▼────┐
                │ MongoDB │
                │  Atlas  │
                └─────────┘
```

## Separate-Domain Architecture

```
  HTTPS :443 ──→ https://app.example.com  (frontend SPA)
                       │
                       │ API calls via VITE_API_BASE_URL
                       ▼
  HTTPS :443 ──→ https://api.example.com  (backend)
                       │
                       ▼
                  ┌─────────┐
                  │ MongoDB │
                  └─────────┘
```

In separate-domain mode, the frontend talks to the backend via absolute URLs.
The backend must allow the frontend origin in CORS and Better Auth trusted origins.

---

## Prerequisites

- Docker + Docker Compose
- MongoDB Atlas account (or self-hosted MongoDB 7)
- Google Cloud Console project (for OAuth)
- Domain name(s) + SSL certificate(s)

## 1. Environment Setup

### Same-domain (`https://docs.example.com`)

```env
# MongoDB Atlas
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/docflow-prod

# Better Auth
BETTER_AUTH_SECRET=a1b2c3d4e5f6...
BETTER_AUTH_URL=https://docs.example.com

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx

# Auth
# Email/password is first-class and ENABLED BY DEFAULT (self-hosted installs
# get a working login with zero external config). Set to false to disable.
EMAIL_PASSWORD_ENABLED=true
SESSION_STRATEGY=jwt

# Server
PORT=3001
CLIENT_ORIGIN=https://docs.example.com
NODE_ENV=production

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_AUTH_MAX=20

# Logging
LOG_LEVEL=info
```

### Separate-domain (`https://app.example.com` + `https://api.example.com`)

**Backend (`apps/server/.env` or `.env.docker`)**

```env
# Better Auth — must be the public backend URL
BETTER_AUTH_URL=https://api.example.com

# Google OAuth — redirect URI must be on the backend domain
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_CALLBACK_URL=https://api.example.com/api/auth/callback/google

# CORS / trusted origins — comma-separated if multiple frontends
CLIENT_ORIGIN=https://app.example.com

PORT=3001
NODE_ENV=production
```

**Frontend build (`apps/demo/.env`)**

```env
VITE_API_BASE_URL=https://api.example.com
```

When building the Docker image, pass the same value:

```bash
docker build --build-arg VITE_API_BASE_URL=https://api.example.com -f docker/Dockerfile.demo -t docflow-demo:latest .
```

---

## 2. Build Docker Images

```bash
# Same-domain build (frontend proxies /api to backend)
docker build -f docker/Dockerfile.server -t docflow-server:latest .
docker build -f docker/Dockerfile.demo -t docflow-demo:latest .

# Separate-domain build (frontend calls backend directly)
docker build --build-arg VITE_API_BASE_URL=https://api.example.com \
  -f docker/Dockerfile.demo -t docflow-demo:latest .

# Tag for registry
docker tag docflow-server:latest registry.yourcompany.com/docflow-server:v1.0.0
docker tag docflow-demo:latest registry.yourcompany.com/docflow-demo:v1.0.0

# Push to registry
docker push registry.yourcompany.com/docflow-server:v1.0.0
docker push registry.yourcompany.com/docflow-demo:v1.0.0
```

## 3. docker-compose.prod.yml

### Same-domain

```yaml
services:
  server:
    image: registry.yourcompany.com/docflow-server:v1.0.0
    container_name: docflow-server
    restart: always
    env_file: .env.production
    ports:
      - "3001:3001"
    networks:
      - docflow

  demo:
    image: registry.yourcompany.com/docflow-demo:v1.0.0
    container_name: docflow-demo
    restart: always
    ports:
      - "8080:80"
    networks:
      - docflow

networks:
  docflow:
    driver: bridge
```

### Separate-domain

```yaml
services:
  server:
    image: registry.yourcompany.com/docflow-server:v1.0.0
    container_name: docflow-server
    restart: always
    env_file: .env.production
    ports:
      - "3001:3001"
    networks:
      - docflow

  demo:
    image: registry.yourcompany.com/docflow-demo:v1.0.0
    container_name: docflow-demo
    restart: always
    # No /api proxy needed; frontend calls api.example.com directly
    ports:
      - "8080:80"
    networks:
      - docflow

networks:
  docflow:
    driver: bridge
```

---

## 4. Nginx Reverse Proxy (HTTPS)

### Same-domain

```nginx
server {
    listen 80;
    server_name docs.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name docs.example.com;

    ssl_certificate     /etc/letsencrypt/live/docs.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/docs.example.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location /auth/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Separate-domain

```nginx
# Frontend
server {
    listen 443 ssl http2;
    server_name app.example.com;

    ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Backend API
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

---

## 5. SSL with Let's Encrypt

```bash
# Install certbot
apt install certbot python3-certbot-nginx

# Get certificate
certbot --nginx -d docs.example.com
# or for separate-domain:
# certbot --nginx -d app.example.com -d api.example.com

# Auto-renewal (cron)
echo "0 3 * * * certbot renew --quiet" | crontab -
```

---

## 6. Google Cloud Console Setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create **OAuth 2.0 Client ID** → **Web application**
3. Add **Authorized redirect URIs**:
   - Same-domain: `https://docs.example.com/api/auth/callback/google`
   - Separate-domain: `https://api.example.com/api/auth/callback/google`
4. Copy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your backend env
5. In separate-domain mode, also set `GOOGLE_CALLBACK_URL=https://api.example.com/api/auth/callback/google`

> ⚠️ The redirect URI must point to the **backend domain**, not the frontend domain.
> After Google authorizes the user, Better Auth redirects to the frontend via the
> `callbackURL` sent by the client.

---

## 7. MongoDB Atlas Setup

1. Create cluster (M10+ for production)
2. Create database user with read/write permissions
3. Whitelist your server IP in Network Access
4. Get connection string → paste into `MONGODB_URI`

---

## 8. Run

```bash
# Start
docker compose -f docker/docker-compose.prod.yml up -d

# Check logs
docker logs docflow-server -f

# Verify
curl https://docs.example.com/api/health
# or (separate-domain):
curl https://api.example.com/api/health
# → {"status":"ok","db":"connected","uptime":3600}

# Stop
docker compose -f docker/docker-compose.prod.yml down
```

---

## 9. Monitoring

```bash
# Health check endpoint
GET /api/health
# → {"status":"ok","db":"connected","uptime":3600,"timestamp":"2026-07-04T..."}

# Logs are JSON for ingestion into ELK/Datadog/etc.
docker logs docflow-server -f
# → {"level":30,"method":"POST","url":"/api/documents","status":200,"duration":"45ms","ip":"..."}
```

---

## 10. Troubleshooting

| Issue | Fix |
|-------|-----|
| MongoDB auth failed | Check `MONGODB_URI` — no `<` `>` brackets |
| Better Auth crash | Set `BETTER_AUTH_SECRET` (32+ chars) |
| Google login redirect fail | Redirect URI must match Google Console exactly and point to backend domain |
| `state_not_found` / OAuth loop | Set `account.storeStateStrategy: 'database'` and `skipStateCookieCheck: true` for cross-domain |
| Rate limited (429) | Increase `RATE_LIMIT_AUTH_MAX` or wait 15 min |
| CORS error | Set `CLIENT_ORIGIN` to your exact frontend domain |
| Session not persisting across domains | Use HTTPS + tune Better Auth cookie config (`advanced.cookie`) if needed |

## 11. Local Development (Cross-Domain)

To test separate-domain locally:

```bash
# Backend
cd apps/server
PORT=3002 \
CLIENT_ORIGIN=http://localhost:5173 \
BETTER_AUTH_URL=http://localhost:3002 \
GOOGLE_CALLBACK_URL=http://localhost:3002/api/auth/callback/google \
EMAIL_PASSWORD_ENABLED=true \
pnpm dev

# Frontend
cd apps/demo
VITE_API_BASE_URL=http://localhost:3002 pnpm dev
```

Add to Google Console authorized redirect URIs:

```
http://localhost:3002/api/auth/callback/google
```

Then open http://localhost:5173 and test Google sign-in.

