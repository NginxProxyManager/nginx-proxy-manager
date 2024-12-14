#!/usr/bin/env sh

export HCNPM_IP="$NPM_IPV4_BINDING"
export HCGOA_IP="$GOA_IPV4_BINDING"


if [ "$NPM_IPV4_BINDING" = "0.0.0.0" ]; then
    export HCNPM_IP="127.0.0.1"
fi

if [ "$GOA_IPV4_BINDING" = "0.0.0.0" ]; then
    export HCGOA_IP="127.0.0.1"
fi

if (if [ "$GOA" = "true" ]; then [ -f /tmp/goa/index.html ] && nc -z "$HCGOA_IP" "$GOA_PORT"; fi && if [ "$PHP82" = true ]; then cgi-fcgi -bind -connect /run/php82.sock > /dev/null 2>&1; fi && if [ "$PHP83" = true ]; then cgi-fcgi -bind -connect /run/php83.sock > /dev/null 2>&1; fi && [ "$(curl -sk https://"$HCNPM_IP":"$NPM_PORT"/api/ | jq --raw-output .status)" = "OK" ]); then
	echo "OK"
	exit 0
else
	echo "NOT OK"
	exit 1
fi
