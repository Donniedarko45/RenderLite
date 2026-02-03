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
- Nixpacks CLI (for building without Dockerfile)
- GitHub OAuth App credentials

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd renderlite
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your GitHub OAuth credentials:
- Go to https://github.com/settings/developers
- Create a new OAuth App
- Set callback URL to `http://localhost:3001/auth/github/callback`
- Copy Client ID and Client Secret to `.env`

### 3. Start Infrastructure

```bash
# Start PostgreSQL, Redis, and Traefik
npm run docker:up
```

### 4. Setup Database

```bash
# Generate Prisma client and push schema
npm run db:generate
npm run db:push
```

### 5. Start Development Servers

```bash
# Terminal 1: API and Worker
npm run dev

# Terminal 2: Frontend
npm run dev:frontend
```

### 6. Access the Application

- Frontend: http://localhost:5173
- API: http://localhost:3001
- Traefik Dashboard: http://localhost:8080

## Project Structure

```
renderlite/
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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | - |
| REDIS_URL | Redis connection string | redis://localhost:6379 |
| GITHUB_CLIENT_ID | GitHub OAuth Client ID | - |
| GITHUB_CLIENT_SECRET | GitHub OAuth Client Secret | - |
| JWT_SECRET | Secret for JWT signing | - |
| API_PORT | API server port | 3001 |
| FRONTEND_URL | Frontend URL for CORS | http://localhost:5173 |
| ENCRYPTION_KEY | AES-256 key for env vars | - |
| BASE_DOMAIN | Base domain for services | renderlite.local |

## Local Domain Setup

Add to your `/etc/hosts` file:
```
127.0.0.1 traefik.renderlite.local
127.0.0.1 *.renderlite.local
```

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
