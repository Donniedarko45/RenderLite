# RenderLite

A simplified Platform-as-a-Service for automated backend deployment. Deploy your backend applications directly from GitHub repositories using container automation, dynamic routing, and real-time monitoring.

## Features

- **GitHub OAuth Authentication** - Secure login with your GitHub account
- **Project & Service Management** - Organize deployments into projects
- **Automated Builds** - Nixpacks or Dockerfile-based builds
- **Docker Container Orchestration** - Isolated container execution
- **Dynamic Routing** - Automatic subdomain assignment with Traefik
- **Real-time Logs** - Live deployment logs via WebSocket
- **Container Metrics** - CPU and memory monitoring with Recharts

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│                    (React + Vite)                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      API Server                             │
│               (Express.js + Socket.io)                      │
└──────────┬─────────────────────────────────┬────────────────┘
           │                                 │
           ▼                                 ▼
┌──────────────────┐              ┌──────────────────────────┐
│    PostgreSQL    │              │         Redis            │
│    (Database)    │              │   (Queue + Cache)        │
└──────────────────┘              └────────────┬─────────────┘
                                               │
                                  ┌────────────▼─────────────┐
                                  │         Worker           │
                                  │   (BullMQ + Dockerode)   │
                                  └────────────┬─────────────┘
                                               │
                                  ┌────────────▼─────────────┐
                                  │     Docker Engine        │
                                  │   (Containers + Build)   │
                                  └────────────┬─────────────┘
                                               │
                                  ┌────────────▼─────────────┐
                                  │        Traefik           │
                                  │    (Reverse Proxy)       │
                                  └──────────────────────────┘
```

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Optional: Nixpacks CLI (worker falls back to Dockerized Nixpacks when missing)
- GitHub OAuth App credentials

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd MiniPaas
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
cp packages/frontend/.env.example packages/frontend/.env.local
```

Edit `.env` and add your GitHub OAuth credentials:
- Go to https://github.com/settings/developers
- Create a new OAuth App
- Set callback URL to `http://localhost:3001/auth/github/callback`
- Copy Client ID and Client Secret to `.env`

Optional for local-only auth bypass (disabled by default):
- Set `DEV_AUTH_ENABLED="true"`
- Set `VITE_DEV_AUTH_ENABLED="true"` in `packages/frontend/.env.local`

### 3. Start Infrastructure

```bash
# Start PostgreSQL, Redis, and Traefik
npm run docker:up
```

### 4. Setup Database

```bash
# Generate Prisma client and push schema
npm run setup:db
```

### 5. Start Development Servers

```bash
# Single command (starts API, worker, and frontend)
npm run dev:stack

# OR run in separate terminals:
# Terminal 1: API and Worker
# npm run dev
# Terminal 2: Frontend
# npm run dev:frontend
```

### 6. Access the Application

- Frontend: http://localhost:5173
- API: http://localhost:3001
- Traefik Dashboard: http://localhost:8080

## Local Bring-up Checklist

Use this exact order for a fresh clone:

```bash
npm install
npm run setup:local
npm run dev:stack
```

`setup:local` starts Docker dependencies and prepares Prisma in one command.

### Canonical Frontend

- Production frontend is `packages/frontend`.
- `apps/dashboard` is a legacy/experimental app and is not required for the main MiniPaas flow.

## Project Structure

```
MiniPaas/
├── packages/
│   ├── api/              # Express.js API server
│   │   ├── src/
│   │   │   ├── routes/   # API endpoints
│   │   │   ├── middleware/
│   │   │   ├── socket/   # WebSocket handlers
│   │   │   └── utils/
│   │   └── prisma/       # Database schema
│   │
│   ├── worker/           # BullMQ deployment worker
│   │   ├── src/
│   │   │   ├── jobs/     # Job processors
│   │   │   ├── builders/ # Build engines
│   │   │   ├── docker/   # Container management
│   │   │   └── git/      # Repository cloning
│   │
│   ├── frontend/         # React dashboard
│   │   └── src/
│   │       ├── pages/
│   │       ├── components/
│   │       ├── contexts/
│   │       └── api/
│   │
│   └── shared/           # Shared types & constants
│
├── traefik/              # Traefik configuration
├── docker-compose.yml    # Infrastructure services
└── package.json          # Workspace root
```

## API Endpoints

### Authentication
- `GET /auth/github` - Initiate GitHub OAuth
- `GET /auth/github/callback` - OAuth callback
- `GET /auth/me` - Get current user
- `POST /auth/dev-login` - Dev-only JWT login (requires `DEV_AUTH_ENABLED=true`)

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Services
- `GET /api/services` - List services
- `POST /api/services` - Create service
- `GET /api/services/:id` - Get service
- `PUT /api/services/:id` - Update service
- `DELETE /api/services/:id` - Delete service

### Deployments
- `GET /api/deployments` - List deployments
- `POST /api/deployments` - Trigger deployment
- `GET /api/deployments/:id` - Get deployment
- `GET /api/deployments/:id/logs` - Get deployment logs

### Metrics
- `GET /api/metrics/service/:id` - Get service metrics
- `GET /api/metrics/overview` - Get dashboard overview

## WebSocket Events

### Client -> Server
- `subscribe:deployment` - Subscribe to deployment logs
- `unsubscribe:deployment` - Unsubscribe from deployment
- `subscribe:service` - Subscribe to service metrics

### Server -> Client
- `deployment:log` - New log line
- `deployment:status` - Status change
- `service:metrics` - Metrics update
- `service:status` - Service status change

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | - |
| REDIS_URL | Redis connection string | redis://localhost:6379 |
| GITHUB_CLIENT_ID | GitHub OAuth Client ID | - |
| GITHUB_CLIENT_SECRET | GitHub OAuth Client Secret | - |
| JWT_SECRET | Secret for JWT signing | - |
| API_PORT | API server port | 3001 |
| API_URL | API base URL | http://localhost:3001 |
| FRONTEND_URL | Frontend URL for CORS | http://localhost:5173 |
| VITE_DEV_AUTH_ENABLED | Show dev login button in frontend | false |
| VITE_BASE_DOMAIN | Frontend base domain for service links | renderlite.local |
| ENCRYPTION_KEY | AES-256 key for env vars | - |
| BASE_DOMAIN | Base domain for services | renderlite.local |
| DEV_AUTH_ENABLED | Enable backend dev auth bypass endpoint | false |
| DEV_AUTH_EMAIL | Local demo user email for dev auth | dev@renderlite.local |
| DEV_AUTH_USERNAME | Local demo username for dev auth | dev-user |

`VITE_*` variables should be defined in `packages/frontend/.env.local`.

## Local Domain Setup

Add to your `/etc/hosts` file:
```
127.0.0.1 traefik.renderlite.local
127.0.0.1 my-service.renderlite.local
```

`/etc/hosts` does not support wildcard domains. Add each service subdomain you want to test locally (or use a local DNS tool such as `dnsmasq`).

## Startup Troubleshooting

- **`/health` returns database errors**: verify `DATABASE_URL` points to local Postgres (`postgresql://user:password@localhost:5432/renderlite?schema=public`) when using `docker:up`.
- **OAuth login fails**: set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_CALLBACK_URL` in `.env`.
- **`/auth/github` returns 503**: GitHub OAuth is intentionally disabled when credentials are missing; configure OAuth or enable dev auth bypass.
- **Worker cannot deploy**: Docker daemon must be running and `/var/run/docker.sock` must be accessible.
- **Service URLs do not resolve**: add explicit service subdomains to `/etc/hosts` (wildcards are not supported in `/etc/hosts`).

## Quality Checks

Run the full workspace validation suite:

```bash
npm run verify
```

## Development Auth Bypass

- GitHub OAuth remains the default and recommended auth flow.
- Dev auth bypass is available only when both `DEV_AUTH_ENABLED` and `VITE_DEV_AUTH_ENABLED` are set to `true`.
- When enabled, use **Continue as Demo User** on the login screen to mint a local JWT for development.

## Tech Stack

- **Backend**: Node.js, Express.js, Prisma, BullMQ
- **Frontend**: React, Vite, TailwindCSS, React Query
- **Database**: PostgreSQL
- **Queue**: Redis + BullMQ
- **Containers**: Docker, Dockerode, Nixpacks
- **Routing**: Traefik
- **Real-time**: Socket.io
- **Charts**: Recharts

## License

MIT
