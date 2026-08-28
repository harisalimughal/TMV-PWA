#!/usr/bin/env bash
# Pull latest main and redeploy via docker compose. Run from /opt/tmv-pwa on the VPS.
# .env.production is untracked (gitignored) so `git pull` never touches it.
set -euo pipefail
cd /opt/tmv-pwa

echo "==> Pulling latest main"
git fetch origin main
git reset --hard origin/main

echo "==> Rebuilding and recreating the container"
docker compose up -d --build

echo "==> Done. Recent logs:"
sleep 3
docker compose logs --tail 30
