#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Dynamic resolvers ...'

DISABLE_IPV6=$(echo "${DISABLE_IPV6:-}" | tr '[:upper:]' '[:lower:]')

# Dynamically generate resolvers file, if resolver is IPv6, enclose in `[]`
# thanks @tfmm
if [ "$(disable_ipv6)" == '1' ]; then
	echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) ipv6=off valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
else
	echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
fi

# Fire off acme.sh wrapper script to "install" itself if required
acme.sh -h > /dev/null 2>&1
