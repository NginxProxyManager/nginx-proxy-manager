#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Setting ownership ...'

# root
chown root /tmp/nginx

# npm user and group
chown -R "$PUID:$PGID" /data
chown -R "$PUID:$PGID" /etc/letsencrypt
chown -R "$PUID:$PGID" /run/nginx
chown -R "$PUID:$PGID" /tmp/nginx
chown -R "$PUID:$PGID" /var/cache/nginx
chown -R "$PUID:$PGID" /var/lib/logrotate
chown -R "$PUID:$PGID" /var/lib/nginx
chown -R "$PUID:$PGID" /var/log/nginx

# Don't chown entire /etc/nginx folder as this causes crashes on some systems
chown -R "$PUID:$PGID" /etc/nginx/nginx
chown -R "$PUID:$PGID" /etc/nginx/nginx.conf
chown -R "$PUID:$PGID" /etc/nginx/conf.d

# Certbot directories - optimized approach
CERT_INIT_FLAG="/opt/certbot/.ownership_initialized"

if [ ! -f "$CERT_INIT_FLAG" ]; then
    # Prevents errors when installing python certbot plugins when non-root
    chown "$PUID:$PGID" /opt/certbot /opt/certbot/bin

    # Handle all site-packages directories efficiently
    find /opt/certbot/lib -type d -name "site-packages" | while read -r SITE_PACKAGES_DIR; do
        chown -R "$PUID:$PGID" "$SITE_PACKAGES_DIR"
    done

    # Create a flag file to skip this step on subsequent runs
    touch "$CERT_INIT_FLAG"
    chown "$PUID:$PGID" "$CERT_INIT_FLAG"
fi