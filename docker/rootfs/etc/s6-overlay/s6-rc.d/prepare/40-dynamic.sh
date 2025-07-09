#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Dynamic resolvers ...'

# Dynamically generate resolvers file, if resolver is IPv6, enclose in `[]`
# thanks @tfmm
if [ "$(is_true "$DISABLE_IPV6")" = '1' ]; then
	echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) ipv6=off valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
else
	echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
fi
