# EC2 + Docker Compose Production Deployment

This document describes the exact process to deploy MiniPaas on a single Amazon EC2 instance with Docker Compose and automated GitHub Actions deployment.

## What this setup deploys

- `traefik` for TLS termination and routing
- `postgres` for application data
- `redis` for queues/cache
- `api` (Express + Socket.io)
- `worker` (BullMQ + Dockerode, with Docker socket access)
- `frontend` (React build served by Nginx)

The automated pipeline lives in `.github/workflows/deploy-ec2.yml` and executes `deploy/ec2/deploy.sh` over SSH.

## 1) Create AWS infrastructure

1. Launch an **Ubuntu 22.04/24.04** EC2 instance.
2. Recommended minimum for this stack:
   - `t3.large` (2 vCPU, 8 GB RAM) for comfortable Docker builds
   - 40+ GB gp3 EBS
3. Security Group inbound rules:
   - TCP `22` from your IP (or VPN/bastion range)
   - TCP `80` from `0.0.0.0/0`
   - TCP `443` from `0.0.0.0/0`
4. Attach an Elastic IP (recommended) so DNS records remain stable.

## 2) Configure DNS

In your DNS provider, point these records to the EC2 public IP:

- `A` record for `app.<your-domain>`
- `A` record for `api.<your-domain>`
- `A` record for `traefik.<your-domain>` (optional dashboard)
- `A` wildcard record `*.<your-domain>` (required for deployed user services)

## 3) Prepare GitHub OAuth app

In GitHub Developer Settings, create/update OAuth app:

- Homepage URL: `https://app.<your-domain>`
- Callback URL: `https://api.<your-domain>/auth/github/callback`

Save client ID and secret for `.env.ec2`.

## 4) Bootstrap EC2 host

SSH into EC2 and run:

```bash
git clone <your-repo-url>
cd MiniPaas
chmod +x deploy/ec2/bootstrap.sh deploy/ec2/deploy.sh
bash deploy/ec2/bootstrap.sh
```

Then reconnect SSH (required for docker group refresh):

```bash
exit
ssh -i <key.pem> ubuntu@<ec2-ip>
```

## 5) Configure repository access on EC2

The deploy script pulls code directly from GitHub via SSH (`git@github.com:owner/repo.git`).

1. Generate deploy key on EC2:
   ```bash
   ssh-keygen -t ed25519 -C "minipaas-ec2-deploy" -f ~/.ssh/id_ed25519 -N ""
   cat ~/.ssh/id_ed25519.pub
   ```
2. Add this public key in GitHub repo:
   - **Settings -> Deploy keys -> Add deploy key**
   - Enable **Allow write access** only if needed (read-only is enough for pull).
3. Add GitHub host to known_hosts:
   ```bash
   ssh-keyscan -H github.com >> ~/.ssh/known_hosts
   chmod 600 ~/.ssh/known_hosts
   ```

## 6) Create production env file on EC2

Use the template:

```bash
cp deploy/ec2/.env.ec2.example .env.ec2
nano .env.ec2
```

Mandatory values to update:

- `BASE_DOMAIN`, `APP_HOST`, `API_HOST`, `TRAEFIK_DASHBOARD_HOST`
- `ACME_EMAIL`
- `JWT_SECRET`
- `ENCRYPTION_KEY` (64 hex chars)
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `POSTGRES_PASSWORD` and matching `DATABASE_URL`
- `TRAEFIK_DASHBOARD_AUTH` (bcrypt hash, with `$` escaped to `$$`)

## 7) Run first deployment manually

From repo root on EC2:

```bash
bash deploy/ec2/deploy.sh
```

What this script does:

1. Pull latest code
2. Build `api`, `worker`, `frontend` Docker images
3. Start `postgres`, `redis`, `traefik`
4. Wait for Postgres readiness
5. Run `prisma migrate deploy`
6. Start `api`, `worker`, `frontend`

## 8) Configure GitHub Actions secrets

In GitHub repo **Settings -> Secrets and variables -> Actions**, create:

- `EC2_HOST` = EC2 public DNS/IP
- `EC2_USER` = SSH username (usually `ubuntu`)
- `EC2_SSH_PRIVATE_KEY` = private key content for CI SSH login to EC2
- `EC2_APP_DIR` = optional, e.g. `/opt/minipaas` (leave empty to use default)

## 9) Enable automatic deployment pipeline

Pipeline file: `.github/workflows/deploy-ec2.yml`

- Triggered on push to `main`
- Also supports manual run via `workflow_dispatch`
- Runs verification (`npm ci`, `npm run verify`) before deploying
- SSHes into EC2 and executes `deploy/ec2/deploy.sh`

To deploy now:

```bash
git push origin main
```

## 10) Post-deploy verification

Run on EC2:

```bash
docker compose --env-file .env.ec2 -f docker-compose.prod.yml ps
docker compose --env-file .env.ec2 -f docker-compose.prod.yml logs -f api
docker compose --env-file .env.ec2 -f docker-compose.prod.yml logs -f worker
```

External checks:

- `https://app.<your-domain>`
- `https://api.<your-domain>/health`
- `https://traefik.<your-domain>` (if enabled)

## Operational notes

- Deployed app containers (created by the worker) share `renderlite-network`.
- Keep `DEV_AUTH_ENABLED=false` and `VITE_DEV_AUTH_ENABLED=false` in production.
- Backups: snapshot EBS volume and/or configure external Postgres backups.
- For rollback, redeploy an earlier commit from GitHub Actions (manual run on target SHA or branch restore).

## Common issues

- **TLS cert not issued**: DNS not pointing correctly, or port 80/443 blocked.
- **Traefik logs `Host(\`\`)` / `no domain was given`**: environment variables were not loaded. Always run with `docker compose --env-file .env.ec2 -f docker-compose.prod.yml ...` and verify `APP_HOST`, `API_HOST`, `TRAEFIK_DASHBOARD_HOST`, and `ACME_EMAIL` are set in `.env.ec2`.
- **OAuth fails**: callback URL mismatch or wrong client secret.
- **Service stuck in `DEPLOYING` with deployment `QUEUED`**: worker is not consuming queue jobs (or Redis was restarted and queue was lost). Check `docker compose --env-file .env.ec2 -f docker-compose.prod.yml ps` and `docker compose --env-file .env.ec2 -f docker-compose.prod.yml logs --tail=200 worker`.
- **Worker crash with `PrismaClientInitializationError` (`debian-openssl-3.0.x`)**: rebuild and restart `api` + `worker` images so Prisma client is generated for the container runtime.
- **Worker crash with Prisma `P2025` on deployment update**: stale/orphaned queue jobs are being processed after deployment records were removed. Pull latest code and rebuild worker; it now skips orphaned jobs safely and no longer exits.
- **Nixpacks fallback fails with `exec: "build": executable file not found`**: worker used an outdated Dockerized Nixpacks invocation. Pull latest code and rebuild `worker`; it now tries explicit Nixpacks entrypoints compatible with current images.
- **Deployment fails with `Build timed out`**: increase `BUILD_TIMEOUT_MS` in `.env.ec2` (for example `1800000` for 30 minutes), then rebuild/restart `worker`.
- **Worker deploys fail**: verify `/var/run/docker.sock` mount and worker container status.
- **DB auth errors**: `POSTGRES_PASSWORD` and `DATABASE_URL` are inconsistent.
- **Prisma `P2021` (`table public.User does not exist`)**: schema was not applied. Re-run `bash deploy/ec2/deploy.sh` so it applies Prisma schema before starting app services.
