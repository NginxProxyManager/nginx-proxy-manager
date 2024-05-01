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

# Prevents errors when installing python certbot plugins when non-root
chown "$PUID:$PGID" /opt/certbot /opt/certbot/bin
find /opt/certbot/lib/python*/site-packages -not -user "$PUID" -execdir chown "$PUID:$PGID" {} \+
