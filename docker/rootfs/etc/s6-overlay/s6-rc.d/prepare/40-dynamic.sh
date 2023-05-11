#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Dynamic resolvers ...'

# Dynamically generate resolvers file, if resolver is IPv6, enclose in `[]`
# thanks @tfmm
if [ "$(is_true "$NPM_DISABLE_IPV6")" = '1' ]; then
	echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) ipv6=off valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
else
	echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
fi

# Fire off acme.sh wrapper script to "install" itself if required
acme.sh -h > /dev/null 2>&1

# Generate IP Ranges from online CDN services
# continue on error, as this could be due to network errors
# and can be attempted again with a docker restart
rm -rf /etc/nginx/conf.d/include/ipranges.conf
set +e
RC=0
if [ "$(is_true "$DEVELOPMENT")" = '1' ]; then
	echo '# ignored in development mode' > /etc/nginx/conf.d/include/ipranges.conf
else
	/app/bin/ipranges > /etc/nginx/conf.d/include/ipranges.conf
	RC=$?
fi
if [ "$RC" != '0' ]; then
	log_warn 'Generation of IP Ranges file has an error. Check output of /etc/nginx/conf.d/include/ipranges.conf for more information.'
fi
set -e
