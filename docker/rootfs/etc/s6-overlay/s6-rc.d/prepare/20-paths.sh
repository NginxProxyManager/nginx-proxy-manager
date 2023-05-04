#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Checking paths ...'

# Ensure /data is mounted
if [ ! -d '/data' ]; then
	log_fatal '/data is not mounted! Check your docker configuration.'
fi
# Ensure /etc/letsencrypt is mounted
if [ ! -d '/etc/letsencrypt' ]; then
	log_fatal '/etc/letsencrypt is not mounted! Check your docker configuration.'
fi

# Create required folders
mkdir -p \
	/data/nginx \
	/data/custom_ssl \
	/data/logs \
	/data/access \
	/data/nginx/default_host \
	/data/nginx/default_www \
	/data/nginx/proxy_host \
	/data/nginx/redirection_host \
	/data/nginx/stream \
	/data/nginx/dead_host \
	/data/nginx/temp \
	/data/letsencrypt-acme-challenge \
	/run/nginx \
	/tmp/nginx/body \
	/var/log/nginx \
	/var/lib/nginx/cache/public \
	/var/lib/nginx/cache/private \
	/var/cache/nginx/proxy_temp

touch /var/log/nginx/error.log || true
chmod 777 /var/log/nginx/error.log || true
chmod -R 777 /var/cache/nginx || true
chmod 644 /etc/logrotate.d/nginx-proxy-manager
