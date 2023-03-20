#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Setting ownership ...'

# root
chown root /tmp/nginx

# npmuser
chown -R npmuser:npmuser \
	/data \
	/etc/letsencrypt \
	/etc/nginx \
	/run/nginx \
	/tmp/nginx \
	/var/cache/nginx \
	/var/lib/logrotate \
	/var/lib/nginx \
	/var/log/nginx
