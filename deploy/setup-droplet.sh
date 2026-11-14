#!/usr/bin/env bash
# One-command setup for a fresh Ubuntu 22.04/24.04 DigitalOcean droplet.
#
# 1. Copy the project to the droplet:   scp -r wanderdesk root@YOUR_IP:/var/www/
# 2. SSH in and run:                    bash /var/www/wanderdesk/deploy/setup-droplet.sh yourdomain.com you@example.com
#
# Do this AFTER your domain's A records (@ and www) point at the droplet's IP,
# otherwise the HTTPS certificate step cannot succeed (the site will still work over http).
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="/var/www/wanderdesk"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: bash $0 yourdomain.com you@example.com"; exit 1
fi
if [ "$(id -u)" -ne 0 ]; then echo "Run as root (or with sudo)."; exit 1; fi
if [ ! -f "$APP_DIR/server/server.js" ]; then
  echo "Project not found in $APP_DIR. Copy it there first (see the top of this file)."; exit 1
fi

echo "==> Installing Node.js, nginx, certbot, firewall"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nodejs nginx certbot python3-certbot-nginx ufw
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node $NODE_MAJOR is too old (need 18+). Install a newer Node from https://nodejs.org then re-run."; exit 1
fi

echo "==> Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

echo "==> Data folder and service"
mkdir -p "$APP_DIR/data"
chown -R www-data:www-data "$APP_DIR/data"
cp "$APP_DIR/deploy/wanderdesk.service" /etc/systemd/system/wanderdesk.service
systemctl daemon-reload
systemctl enable --now wanderdesk
sleep 2
if ! curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  echo "The app did not start. Check:  journalctl -u wanderdesk -n 50"; exit 1
fi

echo "==> nginx for $DOMAIN"
sed "s/example\.com/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/wanderdesk
ln -sf /etc/nginx/sites-available/wanderdesk /etc/nginx/sites-enabled/wanderdesk
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> HTTPS certificate"
if certbot --nginx --non-interactive --agree-tos --redirect -m "$EMAIL" -d "$DOMAIN" -d "www.$DOMAIN"; then
  echo "Done. Visit https://$DOMAIN"
else
  echo "Certificate failed (usually DNS has not updated yet). The site works at http://$DOMAIN."
  echo "Re-run later with:  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi
