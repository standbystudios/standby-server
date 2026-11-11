#!/bin/bash
# One-time installer for the auto-update agent.
# Run in the DigitalOcean web console:
#   curl -fsSL https://raw.githubusercontent.com/standbystudios/standby-server/main/i.sh | bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run this as root (the DigitalOcean web console logs in as root)."; exit 1; }

command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git; }

cat > /usr/local/bin/standby-deploy <<'EOF'
#!/bin/bash
set -uo pipefail
exec 9>/run/standby-deploy.lock
flock -n 9 || exit 0   # another update is already running
REPO=https://github.com/standbystudios/standby-server.git
APP=/opt/standby/app
if [ ! -d "$APP/.git" ]; then
  git clone -q --branch main "$REPO" "$APP" 2>/dev/null || exit 0
fi
cd "$APP" || exit 0
git fetch -q origin main || exit 0
TARGET=$(git rev-parse origin/main)
if [ "$(cat /opt/standby/.deployed 2>/dev/null)" != "$TARGET" ]; then
  git reset -q --hard "$TARGET"
  if [ -f deploy/deploy.sh ]; then
    bash deploy/deploy.sh >> /var/log/standby-deploy.log 2>&1 && echo "$TARGET" > /opt/standby/.deployed
  fi
fi
EOF
chmod 755 /usr/local/bin/standby-deploy

cat > /etc/systemd/system/standby-deploy.service <<'EOF'
[Unit]
Description=Pull and deploy standby-server from GitHub
[Service]
Type=oneshot
ExecStart=/usr/local/bin/standby-deploy
EOF
cat > /etc/systemd/system/standby-deploy.timer <<'EOF'
[Unit]
Description=Check GitHub for updates every 2 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now standby-deploy.timer
echo "Installing the first update now (this takes a few minutes)..."
systemctl start standby-deploy.service   # waits for the run to finish
if [ -f /opt/standby/.deployed ]; then
  echo "AUTO-UPDATE INSTALLED. Your server now updates itself from GitHub."
else
  echo "Auto-update installed, but the first deploy didn't finish. Send Claude the output of: tail -30 /var/log/standby-deploy.log"
fi
