# RenderLite — Backend (Control Plane) + Traefik & Infra

**Presenter:** Kartikey
**Section:** API Server, Job Queue, Real-time Layer, Authentication, Traefik (Routing) & Core Infrastructure
**Time suggestion:** 5–6 minutes

---

## 1. Opening line

> "If the frontend is the cockpit, the backend is the engine room. I’ll walk through the **control plane** — the API that receives every click from the dashboard — and how it talks to Postgres, Redis, the worker, and Traefik to actually launch a container with a public URL."

---

## 2. The system at a glance

```
Browser  ──HTTP/WS──>  API (Express + Socket.io)
                            │
                ┌───────────┼───────────┐
                ▼           ▼           ▼
            Postgres      Redis      BullMQ Queue ──> Worker (Shweta's part)
                            │
                            ▼
                     Real-time Pub/Sub
                            │
                            ▼
                     Socket.io rooms ──> Browser
```

The API never builds containers itself. It **records intent** in Postgres, **enqueues work** in Redis (BullMQ), and **streams events** back to the user.

---

## 3. The API server — what it does

Located in `packages/api/`. Built with **Node.js + Express + TypeScript**.

It exposes the routes the frontend calls:

| Path                    | Purpose                              |
| ----------------------- | ------------------------------------ |
| `/auth/github`          | Start GitHub OAuth                   |
| `/auth/github/callback` | Receive code, mint JWT               |
| `/auth/me`              | Return logged-in user                |
| `/api/projects`         | CRUD projects                        |
| `/api/services`         | CRUD services (a deployable repo)    |
| `/api/deployments`      | Trigger / list / inspect deployments |
| `/api/metrics`          | Dashboard overview + per-service     |
| `/api/domains`          | Custom domains for a service         |
| `/api/organizations`    | Multi-user orgs                      |
| `/api/databases`        | Managed databases                    |
| `/api/webhooks`         | GitHub push webhooks → auto-deploy   |
| `/health`               | Liveness probe (Postgres + Redis)    |

Reference: `packages/api/src/index.ts` — sets up Helmet, CORS, Passport, mounts routers, attaches Socket.io.

---

## 4. Authentication — GitHub OAuth + JWT

* We use **Passport** with **passport-github2**.
* Flow:

  1. User hits `/auth/github` → redirected to GitHub.
  2. GitHub returns a code to `/auth/github/callback`.
  3. We exchange the code, fetch the user's profile, **upsert** them in Postgres.
  4. We sign a **JWT** (`JWT_SECRET`) and redirect to the frontend with the token.
* Every subsequent request carries `Authorization: Bearer <jwt>` and is verified by our `auth` middleware (`packages/api/src/middleware/auth.ts`).

> **Security mention:** environment variables stored on a service are **encrypted with AES-256-GCM** before being written to Postgres (`packages/api/src/utils/encryption.ts`). The `ENCRYPTION_KEY` is a 64-hex-char secret loaded from env.

---

## 5. Database — PostgreSQL via Prisma

* Persistent state lives in Postgres.
* We use **Prisma ORM** for type-safe queries and migrations.
* Main entities: `User`, `Organization`, `Project`, `Service`, `Deployment`, `Domain`, `Database`.
* The schema is in `packages/api/prisma/schema.prisma`.
* On production deploys we run `prisma migrate deploy` (or `db push` as a fallback) before starting the API.

---

## 6. Redis — three jobs in one

Redis is the **glue** of our system. It plays **three** distinct roles:

1. **BullMQ job queue** – when a user clicks "Deploy", the API creates a deployment row in Postgres and pushes a job onto the `BUILD` queue (and `ROLLBACK` queue when rolling back).
2. **Pub/Sub bus** – the worker publishes `deployment:log`, `deployment:status`, `service:status` events on the `REALTIME_EVENTS` channel; the API subscribes and forwards them to Socket.io rooms.
3. **Cache / general key-value** – session helpers, rate-limit counters, etc.

Without Redis, the deploy button would either run synchronously (and hang the request) or the dashboard would never see the live build logs.

---

## 7. The deployment lifecycle (control-plane view)

```
User clicks "Deploy"
       │
       ▼
POST /api/deployments
       │
       ▼
┌───────────────────────────────────────────────┐
│ 1. API creates Deployment row (status=QUEUED) │
│ 2. API adds job to BullMQ "build" queue       │
│ 3. API responds 200 with deploymentId         │
└───────────────────────────────────────────────┘
       │
       ▼
Worker picks up the job (Shweta's section)
       │
       ▼
Worker publishes "deployment:log" / "deployment:status" on Redis
       │
       ▼
API's Socket.io subscriber forwards events to the user's browser
```

Lifecycle: `QUEUED → BUILDING → SUCCESS | FAILED`.

> A safety net runs every hour: `cleanupStaleQueuedDeployments(15)` marks any deployment stuck in `QUEUED` for more than 15 minutes as `FAILED`, so the UI never lies about state.

---

## 8. Real-time layer — Socket.io

`packages/api/src/socket/index.ts` does the heavy lifting:

* Authenticates each socket using the same **JWT**.
* Joins users to rooms: `user:<id>`, `deployment:<id>`, `service:<id>`.
* **Subscribes to Redis `REALTIME_EVENTS`** and re-emits the events into the right rooms — this is how worker logs appear live in the browser.
* Every **5 seconds**, for any subscribed service, the API pulls **container stats** from the Docker socket (CPU %, memory, network RX/TX) and emits `service:metrics` — that powers the live charts on `ServiceDetail`.

This single file is the bridge between **backend events** and **the user's screen**.

---

## 9. Traefik — what it is and why we need it

This is where my section ties into the infra. Shweta will go deeper into the container side; here is the **big picture** of routing.

### The problem

Every deployed service is just a Docker container running on a random internal port. We need:

* A **public URL** per service (e.g. `myapp.renderlite.io`).
* **HTTPS** automatically.
* **No manual Nginx config** — services come and go all the time.

### Why Traefik

**Traefik** is a modern reverse proxy that **discovers services automatically** by reading **Docker labels**. We never edit a config file when a new app deploys. The container *announces itself*, Traefik routes to it.

### How it integrates

* In production (`docker-compose.prod.yml`), Traefik runs as a container with the **Docker socket mounted read-only**.
* Static config (`traefik/traefik.yml`):

  * Two entry points: `:80` (web) and `:443` (websecure), with HTTP→HTTPS redirect.
  * **Let's Encrypt** ACME resolver for automatic TLS certificates.
  * Provider: `docker` (label discovery, network `renderlite-network`).
* Dynamic middlewares (`traefik/dynamic.yml`): rate-limit, security headers, CORS.

So when the worker launches a user container with the right labels (Shweta will show this), Traefik **instantly** routes `<subdomain>.<base-domain>` to that container — with TLS, with HTTP→HTTPS redirect, with rate-limiting — without any human touching configuration.

---

## 10. Core infra (the docker-compose stack)

The backend depends on a small, well-defined set of services. In production these are all containers on the same Docker network.

| Container | Image                | Role                                  |
| --------- | -------------------- | ------------------------------------- |
| traefik   | `traefik:v3.6`       | Reverse proxy, TLS, dynamic routing   |
| postgres  | `postgres:15-alpine` | Application database                  |
| redis     | `redis:7-alpine`     | Job queue + pub/sub + cache           |
| api       | built from `Dockerfile.api-worker` | Express + Socket.io  |
| worker    | built from `Dockerfile.api-worker` | BullMQ worker (Shweta) |
| frontend  | built from `Dockerfile.frontend`   | Static React build via Nginx |

All glued together by `docker-compose.prod.yml` and the deploy script (Dushyant’s section).

---

## 11. Why this design works

* **Separation of concerns**: API never blocks on Docker builds — those are async.
* **Crash-safe**: if the worker dies mid-build, the queue retains the job; cleanup tasks reconcile state.
* **Observable**: every state change becomes a Redis event → instantly visible in the dashboard.
* **Secure by default**: Helmet, CORS, JWT, encrypted env vars, dev-auth disabled in prod.

---

## 12. Closing line

> "The backend is intentionally **boring** in the best way — it accepts a click, records it, hands it to a queue, and uses Redis + Socket.io to keep the user’s screen perfectly in sync with reality. Traefik then makes sure that whatever the worker spins up actually gets a real URL on the internet, automatically."

---

## 13. Q&A cheatsheet

| Likely question                            | Short answer                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Why BullMQ and not raw Redis lists?        | Built-in retries, concurrency control (we set `concurrency: 2`), rate limiter, job inspection.|
| What protects the API?                     | Helmet headers, CORS allowlist, JWT auth middleware, request validation per route.            |
| How is encryption done?                    | AES-256-GCM with a 32-byte key. Format: `iv:authTag:ciphertext`. (`utils/encryption.ts`)      |
| Why a separate worker process?             | Builds are slow; we don’t want to block API event loop or HTTP responses.                     |
| Why Traefik over Nginx?                    | Auto-discovery via Docker labels; no config reload; built-in Let's Encrypt.                   |
| What if Redis restarts?                    | Cleanup tasks mark stale `QUEUED` jobs as failed; user can simply hit Deploy again.           |
