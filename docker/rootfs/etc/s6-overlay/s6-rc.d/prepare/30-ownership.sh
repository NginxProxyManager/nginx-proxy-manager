#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Setting ownership ...'

# root
chown root /tmp/nginx

# npmuser
chown -R "$PUID:$PGID" /data \
	/etc/letsencrypt \
	/run/nginx \
	/tmp/nginx \
	/var/cache/nginx \
	/var/lib/logrotate \
	/var/lib/nginx \
	/var/log/nginx

# Don't chown entire /etc/nginx folder as this causes crashes on some systems
chown -R "$PUID:$PGID" /etc/nginx/nginx \
	/etc/nginx/nginx.conf \
	/etc/nginx/conf.d
