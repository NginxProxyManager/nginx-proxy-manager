#!/command/with-contenv bash
# shellcheck shell=bash

set -e

DATA_PATH=/data

# Ensure /data is mounted
if [ ! -d "$DATA_PATH" ]; then
	echo '--------------------------------------'
	echo "ERROR: $DATA_PATH is not mounted! Check your docker configuration."
	echo '--------------------------------------'
	/run/s6/basedir/bin/halt
	exit 1
fi

echo "❯ Checking folder structure ..."

# Create required folders
mkdir -p /tmp/nginx/body \
	/run/nginx \
	/var/log/nginx \
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
	/var/lib/nginx/cache/public \
	/var/lib/nginx/cache/private \
	/var/cache/nginx/proxy_temp \
	/data/letsencrypt-acme-challenge

touch /var/log/nginx/error.log && chmod 777 /var/log/nginx/error.log && chmod -R 777 /var/cache/nginx
chown root /tmp/nginx

# Dynamically generate resolvers file, if resolver is IPv6, enclose in `[]`
# thanks @tfmm
if [ "$DISABLE_IPV6" == "true" ] || [ "$DISABLE_IPV6" == "on" ] || [ "$DISABLE_IPV6" == "1" ] || [ "$DISABLE_IPV6" == "yes" ];
then
	echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) ipv6=off valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
else
	echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
fi

# Handle IPV6 settings
/bin/handle-ipv6-setting /etc/nginx/conf.d
/bin/handle-ipv6-setting /data/nginx

echo
echo "-------------------------------------
 _   _ ____  __  __
| \ | |  _ \|  \/  |
|  \| | |_) | |\/| |
| |\  |  __/| |  | |
|_| \_|_|   |_|  |_|
-------------------------------------
"
