# RenderLite — Deployment & DevOps

**Presenter:** Dushyant
**Section:** Production hosting on AWS EC2, Docker Compose stack, GitHub Actions CI/CD, DNS & TLS, Operations
**Time suggestion:** 4–5 minutes

---

## 1. Opening line

> "You’ve seen what RenderLite *does*. My part is **how we ship it** — how the code on `main` becomes a running platform on the public internet, with HTTPS, auto-deploys, and zero manual steps after the first bootstrap."

---

## 2. Production architecture (one slide picture)

```
        Developer pushes to "main"
                  │
                  ▼
        ┌──────────────────────┐
        │   GitHub Actions     │  ← .github/workflows/deploy-ec2.yml
        │  (npm ci + verify)   │
        └──────────┬───────────┘
                   │ ssh
                   ▼
        ┌──────────────────────┐
        │  AWS EC2 (Ubuntu)    │
        │                      │
        │  ┌────────────────┐  │
        │  │ Docker Compose │  │  ← docker-compose.prod.yml
        │  │  ─ traefik     │  │
        │  │  ─ postgres    │  │
        │  │  ─ redis       │  │
        │  │  ─ api         │  │
        │  │  ─ worker      │  │
        │  │  ─ frontend    │  │
        │  └────────────────┘  │
        └──────────┬───────────┘
                   │
                   ▼
       https://app.<your-domain>
       https://api.<your-domain>
       https://*.<your-domain>   ← user-deployed services
```

---

## 3. Where it lives

* **Compute:** a single **AWS EC2** Ubuntu 22.04/24.04 instance. Recommended: `t3.large` (2 vCPU, 8 GB RAM) with 40+ GB gp3 EBS — enough for comfortable Docker builds.
* **Reverse proxy / TLS:** **Traefik v3** in a container.
* **Data:** Postgres + Redis as containers, each with a persistent named volume.
* **Network:** a dedicated Docker bridge network `renderlite-network` shared by all stack containers and all user-deployed containers, so Traefik can route to anything the worker spins up.

> Single-VM design is intentional: simple to reason about, cheap to run, easy to demo.

---

## 4. AWS / Networking setup (one-time)

1. Launch an Ubuntu EC2 with an **Elastic IP** so the public IP doesn’t change.
2. Security Group inbound rules:

   * `22` — SSH (your IP only)
   * `80` — HTTP (`0.0.0.0/0`)
   * `443` — HTTPS (`0.0.0.0/0`)
3. **DNS records** (in Route 53 / Cloudflare / etc.) pointing to the Elastic IP:

   * `app.<domain>` → frontend
   * `api.<domain>` → backend
   * `traefik.<domain>` → Traefik dashboard (optional, basic-auth protected)
   * **`*.<domain>` (wildcard)** → all user-deployed services
4. **GitHub OAuth App** with:

   * Homepage: `https://app.<domain>`
   * Callback: `https://api.<domain>/auth/github/callback`

The wildcard DNS record is the magic that makes "every new deployment instantly gets a public URL" possible.

---

## 5. Bootstrapping the EC2 host

We ship a single script: `deploy/ec2/bootstrap.sh`.

It does:

1. `apt-get install` — `ca-certificates`, `curl`, `git`, `gnupg`.
2. Installs **Docker Engine** + **Compose plugin** via `get.docker.com`.
3. Enables and starts the docker daemon.
4. Adds the SSH user to the `docker` group.
5. Creates the app dir at `/opt/minipaas` with the right ownership.

Then we add a **GitHub deploy key** so the EC2 box can pull the repo over SSH, configure the production environment file `.env.ec2` (DB password, JWT secret, encryption key, OAuth credentials, base domain, ACME email, Traefik basic-auth hash), and we’re ready to deploy.

---

## 6. The deploy script — `deploy/ec2/deploy.sh`

This is the script that *actually performs the deploy* (called by CI or manually).

It:

1. Clones (or `git pull`s) the repo at `/opt/minipaas`.
2. Optionally checks out the exact commit SHA (`DEPLOY_REF`) so CI deploys are deterministic.
3. Loads `.env.ec2`.
4. Builds `api`, `worker`, and `frontend` Docker images from `docker-compose.prod.yml`.
5. Starts core dependencies first: **Postgres → Redis → Traefik**.
6. **Waits for Postgres readiness** with `pg_isready` (up to 40 retries × 3s).
7. Applies the database schema:

   * If migrations exist → `prisma migrate deploy`.
   * Else → `prisma db push` as a fallback.
8. Starts the app services: **api, worker, frontend** (with `--remove-orphans`).
9. Prints `docker compose ps` so you can see everything healthy.

Crucially, all Compose commands are run with `--env-file .env.ec2` so production secrets are never in plain compose files.

---

## 7. CI/CD — automatic deploys with GitHub Actions

Workflow file: `.github/workflows/deploy-ec2.yml`.

Triggers:

* Every push to `main`.
* Manual run via **workflow_dispatch** (used for re-deploys / rollbacks).

Pipeline steps:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` (Node 20, npm cache).
3. `npm ci`
4. **`npm run verify`** — typechecks, lints, sanity-checks every package. We do **not** ship if verify fails.
5. Configure SSH:

   * Write `EC2_SSH_PRIVATE_KEY` secret to `~/.ssh/id_ed25519`.
   * `ssh-keyscan` the EC2 host into `known_hosts`.
6. SSH into EC2 and **stream `deploy/ec2/deploy.sh` over stdin**, passing `DEPLOY_BRANCH`, `DEPLOY_REF` (= `github.sha`), and `DEPLOY_REPO_URL`.

Concurrency guard:

```yaml
concurrency:
  group: ec2-production
  cancel-in-progress: false
```

So two pushes back-to-back will **queue**, never run in parallel and corrupt the host.

GitHub secrets required:

| Secret                | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `EC2_HOST`            | Public DNS or IP of the EC2 instance                 |
| `EC2_USER`            | SSH user (typically `ubuntu`)                        |
| `EC2_SSH_PRIVATE_KEY` | Private key for the CI to SSH into EC2               |
| `EC2_APP_DIR`         | (Optional) override of the deployment directory      |

---

## 8. TLS — fully automatic, fully free

Traefik is configured with the **Let's Encrypt ACME** resolver. The first time a hostname is hit, Traefik:

1. Solves the **HTTP-01 challenge** on port 80.
2. Requests a real certificate from Let's Encrypt.
3. Stores it in a persistent `acme_data` volume so we don’t hit rate limits on restarts.

No human ever runs `certbot`. New user services get certificates the moment their container appears, because their Traefik labels include `tls.certresolver=letsencrypt`.

---

## 9. Day-2 operations

### Verifying a deploy

```bash
docker compose --env-file .env.ec2 -f docker-compose.prod.yml ps
docker compose --env-file .env.ec2 -f docker-compose.prod.yml logs -f api
docker compose --env-file .env.ec2 -f docker-compose.prod.yml logs -f worker
```

External smoke tests:

* `https://app.<domain>` — dashboard loads.
* `https://api.<domain>/health` — returns `{ status: "ok" }`.
* `https://traefik.<domain>` — dashboard (basic-auth).

### Rolling back

* GitHub → Actions → "Deploy to EC2" → **Run workflow** on a previous commit / branch.
* The deploy script honors `DEPLOY_REF`, so it checks out that exact SHA before building.
* No DB migrations are auto-reversed — that's expected for forward-only Prisma migrations.

### Backups

* The EBS volume holds the `postgres_data`, `redis_data`, and `acme_data` Docker volumes.
* Production snapshots: take EBS snapshots on a schedule, optionally combine with a `pg_dump` cron.

---

## 10. Common issues and how we handle them

| Symptom                                                  | Likely cause / fix                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| TLS certificate not issued                               | DNS not pointing to EC2 IP, or Security Group blocking 80/443.                      |
| Traefik logs `Host(\`\`)` / "no domain was given"       | `.env.ec2` not loaded — must use `docker compose --env-file .env.ec2`.              |
| OAuth login fails                                        | Callback URL mismatch in GitHub OAuth app, or wrong client secret in `.env.ec2`.    |
| Service stuck in `DEPLOYING` / `QUEUED`                  | Worker not consuming jobs; check `docker compose logs worker`.                      |
| Worker crash: `PrismaClientInitializationError`          | Rebuild api + worker images so Prisma client is generated for the container OS.     |
| `Build timed out`                                        | Increase `BUILD_TIMEOUT_MS` in `.env.ec2` (e.g. `1800000` for 30 minutes).          |
| Worker can’t deploy                                      | Verify `/var/run/docker.sock` is mounted into the worker container.                 |
| Postgres `P2021` (table does not exist)                  | Re-run `bash deploy/ec2/deploy.sh` — it applies the schema before starting the API. |

This troubleshooting matrix is documented inside the repo at `docs/ec2-deployment.md` so on-call work doesn’t need tribal knowledge.

---

## 11. Why this deployment design

* **Minimal infra, maximum repeatability:** one EC2 box, one Compose file, one deploy script.
* **Idempotent:** running `deploy.sh` twice results in the same healthy state.
* **Atomic from the user's perspective:** the GitHub Action is the only "button"; everything else is automated.
* **No vendor lock-in:** no AWS-specific service apart from EC2 itself; the same script would work on any Ubuntu VM (Hetzner, DigitalOcean, on-prem).
* **Cheap:** a single small VM hosts the platform *and* every user app deployed on it.

---

## 12. Closing line

> "So in the end, deploying RenderLite is a one-liner: `git push origin main`. GitHub verifies the build, SSHes into our EC2 box, runs Compose, runs the migrations, and the platform is back up — TLS, dashboard, API, worker, all of it — without anyone touching the server."

---

## 13. Q&A cheatsheet

| Likely question                              | Short answer                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Why a single EC2 instead of Kubernetes?      | RenderLite is a learning-grade PaaS. Compose keeps it understandable; we’d migrate to K8s only when scaling beyond one host. |
| What about high availability?                | Out of scope for v1. We document EBS snapshots and forward-only migrations as the recovery path. |
| How do you protect the Traefik dashboard?    | Put it behind `traefik-auth` basic-auth using a bcrypt hash in `.env.ec2`.                   |
| How are secrets handled in CI?               | Stored in GitHub Actions secrets; only the SSH key + host + user are needed at runtime.       |
| How does the wildcard DNS work?              | One `*.<domain>` A record → EC2 IP. Traefik matches the host header from the user’s request to a container’s label. |
| Can deploys be paused?                       | Yes — the `concurrency` group `ec2-production` serializes runs. You can also disable the workflow. |
| What happens if the EC2 reboots?             | All services have `restart: unless-stopped`. Compose brings the stack back automatically.    |
