# RenderLite — Backend (Execution Engine) + Traefik & Container Infra

**Presenter:** Shweta
**Section:** Worker / Build & Run pipeline, Docker integration, Traefik labels & TLS, Security & Cleanup
**Time suggestion:** 5–6 minutes

---

## 1. Opening line

> "Kartikey showed how the API just *records intent* and pushes a job to Redis. My side of the backend is the part that **actually does the work** — clones the repo, builds the image, launches the container, and tells Traefik how to route traffic to it. This is where source code becomes a live URL."

---

## 2. The Worker — what it is

Located in `packages/worker/`. A standalone Node.js process that:

1. Subscribes to BullMQ queues (`BUILD` and `ROLLBACK`) on Redis.
2. Picks jobs and runs the **deployment pipeline** end-to-end.
3. Talks to the host **Docker Engine** through `/var/run/docker.sock` using **Dockerode**.
4. Streams logs back to the API in real-time via Redis Pub/Sub.
5. Periodically runs **cleanup tasks** (orphaned containers, stale jobs, old deployments).

> Mounted with the Docker socket: `volumes: ["/var/run/docker.sock:/var/run/docker.sock"]`. This is what gives the worker the power to start/stop containers on the host.

Tech: **Node.js + TypeScript + BullMQ + Dockerode + simple-git + Nixpacks**.

---

## 3. The deployment pipeline (step-by-step)

This is the **heart** of RenderLite. Reference: `packages/worker/src/jobs/deployment.ts`.

```
[Job picked from queue]
        │
        ▼
1. Update DB → status = BUILDING
2. Clone GitHub repo (with token if private)
3. Save commit SHA on the deployment row
4. Detect build strategy:
       Dockerfile present?  →  Docker build
       No Dockerfile?       →  Nixpacks build
5. Tag image: renderlite-<subdomain>:<short-sha>
6. Read verified custom domains from DB
7. Decide deploy mode:
       Existing container + healthCheckPath  →  Blue-Green
       Otherwise                              →  Stop-old-then-start-new
8. Run new container with Traefik labels
9. (Blue-Green) Wait for health check → swap → remove old
10. Publish "service available at <subdomain>.<base-domain>"
11. Cleanup tmp work dir
```

Failure at any step → the deployment is marked **FAILED**, logs are saved, and the new container (if any) is removed so we never leak resources.

---

## 4. The build engines — Dockerfile *or* Nixpacks

We support **two** build paths so users don’t have to write a Dockerfile if they don't want to.

Reference: `packages/worker/src/builders/index.ts`.

### a) Dockerfile build (Dockerode + BuildKit)

* Used when the repo contains a `Dockerfile`.
* We enable **BuildKit** (`DOCKER_BUILDKIT=1`) and pass `--cache-from <image>:latest` so layer cache survives across deploys → much faster rebuilds.
* On success we **tag the image as `:latest`** to feed the next build’s cache.

### b) Nixpacks build (zero-config)

* Used when there is **no Dockerfile**.
* **Nixpacks** auto-detects Node, Python, Go, Rust, Ruby, Java, PHP… and produces a Docker image without any user configuration.
* If `nixpacks` isn’t installed locally on the host, we **fall back to a Dockerized Nixpacks** image (`ghcr.io/railwayapp/nixpacks:latest`) and try multiple known entrypoints — making the platform robust across hosts.

Both paths respect a configurable **build timeout** (`BUILD_TIMEOUT_MS`, default 20 min) so a runaway build can’t hang the worker forever.

---

## 5. Container runtime — how we launch user apps

Reference: `packages/worker/src/docker/container.ts`.

For every running service we create a Docker container with:

* A **deterministic name**: `renderlite-<subdomain>`.
* The user’s **encrypted env vars** (decrypted just-in-time before injection).
* **Resource caps**: 512 MB memory, 0.5 vCPU (Docker `Memory` + `NanoCpus`).
* **Restart policy**: `unless-stopped` → if the app crashes, Docker restarts it.
* **Network**: `renderlite-network` (the same shared bridge Traefik watches).
* **Marker labels**: `renderlite.managed=true`, `renderlite.subdomain=<...>` — used by cleanup to tell *our* containers from random containers on the host.

> Important: every container runs in its **own namespace** (process / network / mount isolation), so user A’s code can’t see user B’s code.

---

## 6. Traefik — how the worker plugs into routing

This is the part that ties Kartikey’s "Traefik exists" into "Traefik actually works".

The trick is: **the container itself announces its routing rules** via Docker labels. Traefik watches Docker, sees those labels, and instantly creates routes. We never edit Traefik configuration.

Below is what the worker writes onto every user container:

```
traefik.enable                                            = true
traefik.docker.network                                    = renderlite-network
traefik.http.routers.renderlite-<sub>.rule                = Host(`<sub>.<base-domain>`)
traefik.http.routers.renderlite-<sub>.entrypoints         = websecure
traefik.http.services.renderlite-<sub>.loadbalancer.server.port = 3000
# When TLS is enabled (production):
traefik.http.routers.renderlite-<sub>.tls                 = true
traefik.http.routers.renderlite-<sub>.tls.certresolver    = letsencrypt
renderlite.managed                                        = true
renderlite.subdomain                                      = <sub>
```

What this gives us automatically:

* A **public hostname** per service (`<subdomain>.<base-domain>`).
* **HTTPS via Let's Encrypt** with no manual cert management.
* **HTTP → HTTPS redirect** at the edge.
* **Custom domain support**: for each verified domain on a service we add an extra `Host(\`yourdomain.com\`)` router with TLS — so users can bring their own domain and we issue the cert automatically.

Result: by the time the worker says *"container started"*, the URL is **already live**. No DNS reload, no config push.

---

## 7. Health checks & Blue-Green deployments

For services that define a `healthCheckPath` (like `/health`), we do a **zero-downtime** swap:

1. Start the **new** container alongside the old one (with a temporary name).
2. Hit the health-check path repeatedly until it returns success (with retries + timeout).
3. **Only then** stop and remove the **old** container.
4. Re-create the new container under the canonical name → Traefik now points to it.

If the health check **fails**, we destroy the new container and keep the old one running. The user’s site never goes down because of a bad deploy.

For services **without** a health-check path, we use a simpler "stop old, start new" strategy.

---

## 8. Real-time logs from the worker

Every line of `git clone`, `docker build`, `docker run`, and "Service available at…" is fed through a `LogCallback` that does **two** things in parallel:

1. Writes the line into BullMQ’s `job.log()` (so it’s persisted on the job).
2. Publishes a `deployment:log` event on Redis — which the API forwards to the right Socket.io room → live in the user's browser.

This is what makes the **streaming logs** on the frontend actually feel like watching `kubectl logs`.

---

## 9. Security & resilience features

| Concern                       | Mitigation                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Leaking secrets               | Env vars are AES-256-GCM encrypted in Postgres; decrypted just-in-time before being injected.                            |
| Runaway builds                | `BUILD_TIMEOUT_MS` enforced for both Nixpacks and Dockerfile paths.                                                     |
| Stuck deployments             | Hourly job marks any deployment **`QUEUED` for >15 min** as `FAILED`.                                                   |
| Orphaned containers           | Cleanup walks all `renderlite.managed=true` containers; reconciles DB state vs reality.                                 |
| Old/failed deploys piling up  | Keep last 10 successful per service; auto-remove failed ones older than 24h.                                            |
| Stale BullMQ jobs after wipe  | Deployment processor checks if the DB row still exists; logs `[WARN]` and exits gracefully if it doesn’t.               |
| Bad image / crash             | Restart policy `unless-stopped`; if health check fails, we keep the old version and remove the new container.           |

These are the small details that turn a demo-ware PaaS into something you’d actually trust with a side-project.

---

## 10. The infra dependencies the worker uses

* **Docker Engine** on the host – we mount the socket, but we never `sudo`.
* **Postgres** – read repo info, write deployment status / logs / image tag.
* **Redis** – BullMQ workers + Pub/Sub for live logs.
* **`renderlite-network` bridge** – every container we launch joins this network so Traefik can reach it.
* **`/tmp/renderlite/<deploymentId>`** – ephemeral working directory; wiped after every deploy.

---

## 11. Closing line

> "So the worker is essentially a **mini Heroku in 600 lines of TypeScript**: it pulls your code, builds it intelligently, runs it under tight resource limits, hands the right Docker labels to Traefik so the URL is live with TLS, and has a health-check / blue-green safety net so a bad commit doesn’t take your site down."

---

## 12. Q&A cheatsheet

| Likely question                                  | Short answer                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| What if the user has no Dockerfile?              | We fall back to **Nixpacks** which auto-detects the language and builds a working image.           |
| Is build cache reused?                           | Yes — BuildKit + `cache-from <image>:latest`, plus a persistent `/tmp/nixpacks-cache` dir.         |
| How is downtime avoided?                         | Blue-Green deploy: new container → health check → swap. Old one is removed only after success.    |
| What stops a container from eating the whole VM? | Per-container `Memory: 512MB`, `NanoCpus: 0.5`. Configurable per service.                          |
| How does Traefik discover new services?          | It watches the Docker socket. The container’s labels *are* the configuration.                     |
| How do custom domains get TLS?                   | Same labels, extra router per domain, `tls.certresolver=letsencrypt` → ACME issues the cert.       |
| How do we recover from a worker crash mid-build? | BullMQ retains the job; on restart it’s reprocessed. Cleanup tasks reconcile any partial state.    |
