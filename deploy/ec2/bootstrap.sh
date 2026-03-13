#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/minipaas}"

echo "==> Installing OS dependencies"
sudo apt-get update
sudo apt-get install -y ca-certificates curl git gnupg lsb-release

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker Engine + Compose plugin"
  curl -fsSL https://get.docker.com | sudo sh
else
  echo "==> Docker already installed"
fi

sudo systemctl enable docker
sudo systemctl start docker

echo "==> Adding current user to docker group"
sudo usermod -aG docker "$USER" || true

echo "==> Preparing app directory at $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER:$USER" "$APP_DIR"

echo
echo "Bootstrap complete."
echo "Open a new SSH session before running docker commands (group refresh)."
