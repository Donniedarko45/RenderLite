#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/minipaas}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_REPO_URL="${DEPLOY_REPO_URL:-git@github.com:owner/repo.git}"
DEPLOY_REF="${DEPLOY_REF:-}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.ec2"

echo "==> Deploy branch: $DEPLOY_BRANCH"
echo "==> App dir: $APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed on this host." >&2
  exit 1
fi

if [ ! -d "$APP_DIR/.git" ]; then
  echo "==> Cloning repository"
  git clone --branch "$DEPLOY_BRANCH" "$DEPLOY_REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

echo "==> Fetching latest code"
git fetch origin --tags

if git show-ref --verify --quiet "refs/heads/$DEPLOY_BRANCH"; then
  git checkout "$DEPLOY_BRANCH"
else
  git checkout -b "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
fi

git pull --ff-only origin "$DEPLOY_BRANCH"

if [ -n "$DEPLOY_REF" ]; then
  echo "==> Checking out ref: $DEPLOY_REF"
  git checkout --detach "$DEPLOY_REF"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE in $APP_DIR" >&2
  echo "Copy deploy/ec2/.env.ec2.example to .env.ec2 and fill required values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "==> Building application images"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api worker frontend

echo "==> Starting core dependencies (Postgres, Redis, Traefik)"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d postgres redis traefik

echo "==> Waiting for Postgres readiness"
POSTGRES_READY=0
for _ in $(seq 1 40); do
  if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    POSTGRES_READY=1
    break
  fi
  sleep 3
done

if [ "$POSTGRES_READY" -ne 1 ]; then
  echo "Postgres did not become ready in time." >&2
  exit 1
fi

echo "==> Running Prisma migrations"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm api \
  npx prisma migrate deploy --schema packages/api/prisma/schema.prisma

echo "==> Starting app services"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans api worker frontend

echo "==> Deployment complete"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
