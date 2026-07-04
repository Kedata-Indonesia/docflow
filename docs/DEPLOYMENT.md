# Deployment Guide — DocsEditor

## Architecture

```
                     ┌──────────────┐
  HTTPS :443 ───────→│   nginx      │
                     │  (reverse    │
                     │   proxy)     │
                     └──┬────────┬──┘
                        │        │
                   /api/*    static files
                        │        │
                 ┌──────▼──┐ ┌──▼──────┐
                 │ server  │ │  demo   │
                 │ :3001   │ │  (cdn)  │
                 └────┬────┘ └─────────┘
                      │
                 ┌────▼────┐
                 │ MongoDB │
                 │  Atlas  │
                 └─────────┘
```

## Prerequisites

- Docker + Docker Compose
- MongoDB Atlas account (or self-hosted MongoDB 7)
- Google Cloud Console project (for OAuth)
- Domain name + SSL certificate

## 1. Environment Setup

Copy and customize `.env.docker`:

```bash
cp .env.docker .env.production
```

Edit `.env.production`:

```env
# MongoDB Atlas
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/docflow-prod

# Better Auth — generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=a1b2c3d4e5f6...
BETTER_AUTH_URL=https://docs.yourdomain.com

# Google OAuth — redirect URI: https://docs.yourdomain.com/api/auth/callback/google
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx

# Auth
EMAIL_PASSWORD_ENABLED=true
SESSION_STRATEGY=jwt

# Server
PORT=3001
CLIENT_ORIGIN=https://docs.yourdomain.com
NODE_ENV=production

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_AUTH_MAX=20

# Logging
LOG_LEVEL=info
```

## 2. Build Docker Images

```bash
# Build images
docker build -f docker/Dockerfile.server -t docflow-server:latest .
docker build -f docker/Dockerfile.demo -t docflow-demo:latest .

# Tag for registry
docker tag docflow-server:latest registry.yourcompany.com/docflow-server:v1.0.0
docker tag docflow-demo:latest registry.yourcompany.com/docflow-demo:v1.0.0

# Push to registry
docker push registry.yourcompany.com/docflow-server:v1.0.0
docker push registry.yourcompany.com/docflow-demo:v1.0.0
```

## 3. docker-compose.prod.yml

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

## 4. Nginx Reverse Proxy (HTTPS)

```nginx
server {
    listen 80;
    server_name docs.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name docs.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/docs.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/docs.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    # Static files (demo app)
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # Auth callbacks
    location /auth/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 5. SSL with Let's Encrypt

```bash
# Install certbot
apt install certbot python3-certbot-nginx

# Get certificate
certbot --nginx -d docs.yourdomain.com

# Auto-renewal (cron)
echo "0 3 * * * certbot renew --quiet" | crontab -
```

## 6. Google Cloud Console Setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID → Web application
3. Add redirect URI: `https://docs.yourdomain.com/api/auth/callback/google`
4. Copy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env.production`

## 7. MongoDB Atlas Setup

1. Create cluster (M10+ for production)
2. Create database user with read/write permissions
3. Whitelist your server IP in Network Access
4. Get connection string → paste into `MONGODB_URI`

## 8. Run

```bash
# Start
docker compose -f docker/docker-compose.prod.yml up -d

# Check logs
docker logs docflow-server -f

# Verify
curl https://docs.yourdomain.com/api/health
# → {"status":"ok","db":"connected","uptime":3600}

# Stop
docker compose -f docker/docker-compose.prod.yml down
```

## 9. Monitoring

```bash
# Health check endpoint
GET /api/health
# → {"status":"ok","db":"connected","uptime":3600,"timestamp":"2026-07-04T..."}

# Logs are JSON for ingestion into ELK/Datadog/etc.
docker logs docflow-server -f
# → {"level":30,"method":"POST","url":"/api/documents","status":200,"duration":"45ms","ip":"..."}
```

## 10. Troubleshooting

| Issue | Fix |
|-------|-----|
| MongoDB auth failed | Check `MONGODB_URI` — no `<` `>` brackets |
| Better Auth crash | Set `BETTER_AUTH_SECRET` (32+ chars) |
| Google login redirect fail | Redirect URI must match Google Console exactly |
| Rate limited (429) | Increase `RATE_LIMIT_AUTH_MAX` or wait 15 min |
| CORS error | Set `CLIENT_ORIGIN` to your domain |
| Session not persisting | Use `SESSION_STRATEGY=jwt` for stateless |
