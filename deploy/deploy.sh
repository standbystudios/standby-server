#!/bin/bash
# Run by the server's auto-update timer after each new commit on main.
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p /opt/standby/secrets /opt/standby/data/throws /opt/standby/caddy-data /opt/standby/caddy-config
chmod 700 /opt/standby/secrets
chown -R 1000:1000 /opt/standby/data/throws   # the app runs as the "node" user (uid 1000)

# Retire the temporary "coming soon" container from first boot, if it is still running.
if docker ps -a --format '{{.Names}}' | grep -qx caddy; then
  docker rm -f caddy
fi

docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
echo "Deployed $(git rev-parse --short HEAD) at $(date)"
