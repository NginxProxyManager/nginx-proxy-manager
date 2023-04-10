#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Checking paths ...'

# Ensure /data is mounted
if [ ! -d '/data' ]; then
	log_fatal '/data is not mounted! Check your docker configuration.'
fi

# Create required folders
mkdir -p /tmp/nginx/body \
	/run/nginx \
	/var/log/nginx \
	/var/lib/nginx/cache/public \
	/var/lib/nginx/cache/private \
	/var/cache/nginx/proxy_temp \
	/data/logs \
	/data/nginx

touch /var/log/nginx/error.log || true
chmod 777 /var/log/nginx/error.log || true
chmod -R 777 /var/cache/nginx || true
