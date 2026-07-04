# DocsEditor — Documentation

## Index

| Document | Description |
|----------|-------------|
| [PRD.md](./PRD.md) | Product Requirements Document — fitur, arsitektur, tech stack |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Cara deploy production (Docker, env, nginx, SSL, monitoring) |
| [PUBLISH.md](./PUBLISH.md) | Cara publish packages ke GitHub Packages + CI/CD |
| [INTEGRATION.md](./INTEGRATION.md) | Cara integrasi di project Vue/React/Vanilla |

## Quick Links

```bash
# Development
pnpm dev               # Start demo app (port 5173)
pnpm dev:server        # Start backend (port 3001)

# Docker
docker compose -f docker/docker-compose.yml up -d

# Tests
pnpm test:unit         # Unit tests (vitest)
pnpm test:e2e          # E2E tests (playwright)

# Build
pnpm build             # Build all packages + server
```
