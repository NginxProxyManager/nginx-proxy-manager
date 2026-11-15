#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Dynamic resolvers ...'

# Dynamically generate resolvers file, if resolver is IPv6, enclose in `[]`
# thanks @tfmm
if [ "$(is_true "${DISABLE_RESOLVER:-}")" = '0' ]; then
	if [ "$(is_true "${DISABLE_IPV6:-}")" = '1' ]; then
		echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) ipv6=off valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
	else
		echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
	fi
fi

# An nginx.conf kept from an older release (bind-mounted or customised) neither includes
# proxy-variables.conf nor defines $forward_host, which the shipped includes and generated
# hosts use. Load the variables through conf.d/*.conf for such a file only, so the shipped
# nginx.conf keeps them ahead of the custom http_top.conf.
PROXY_VARIABLES_COMPAT=/etc/nginx/conf.d/proxy-variables-compat.conf
# shellcheck disable=SC2016 # matches the literal $forward_host
if sed 's/#.*//' /etc/nginx/nginx.conf | grep -Eq 'proxy-variables\.conf|\$forward_host'; then
	rm -f "$PROXY_VARIABLES_COMPAT"
else
	log_info 'nginx.conf does not define the proxy variables, loading them from conf.d ...'
	echo 'include /etc/nginx/conf.d/include/proxy-variables.conf;' > "$PROXY_VARIABLES_COMPAT"
fi
