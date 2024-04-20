#!/bin/sh

export HCNPM_IP="localhost"
export HCGOA_IP="localhost"

if [ "$NPM_LISTEN_LOCALHOST" = "true" ]; then
    export NPM_IPV4_BINDING="127.0.0.1"
    export NPM_IPV6_BINDING="[::1]"
fi

if [ "$NPM_IPV6_BINDING" != "[::]" ] && [ "$NPM_IPV4_BINDING" != "0.0.0.0" ]; then
    if [ "$NPM_IPV6_BINDING" != "[::]" ] && [ "$NPM_DISABLE_IPV6" = "false" ]; then
        export HCNPM_IP="$NPM_IPV6_BINDING"
    fi
    if [ "$NPM_IPV4_BINDING" != "0.0.0.0" ]; then
        export HCNPM_IP="$NPM_IPV4_BINDING"
    fi
fi

if [ "$GOA_LISTEN_LOCALHOST" = "true" ]; then
    export GOA_IPV4_BINDING="127.0.0.1"
    export GOA_IPV6_BINDING="[::1]"
fi

if [ "$GOA_IPV6_BINDING" != "[::]" ] && [ "$GOA_IPV4_BINDING" != "0.0.0.0" ]; then
    if [ "$GOA_IPV6_BINDING" != "[::]" ] && [ "$GOA_DISABLE_IPV6" = "false" ]; then
        export HCGOA_IP="$GOA_IPV6_BINDING"
    fi
    if [ "$NPM_IPV4_BINDING" != "0.0.0.0" ]; then
        export HCGOA_IP="$GOA_IPV4_BINDING"
    fi
fi

if (if [ "$GOA" = "true" ]; then [ -f /tmp/goa/index.html ] && nc -z "$HCGOA_IP" "$GOA_PORT"; fi && if [ "$PHP81" = true ]; then cgi-fcgi -bind -connect /run/php81.sock > /dev/null 2>&1; fi && if [ "$PHP82" = true ]; then cgi-fcgi -bind -connect /run/php82.sock > /dev/null 2>&1; fi && cgi-fcgi -bind -connect /run/php83.sock > /dev/null 2>&1 && [ "$(curl -sk https://"$HCNPM_IP":"$NPM_PORT"/status | jq -r .status)" = "ok" ]); then
	echo "OK"
	exit 0
else
	echo "NOT OK"
	exit 1
fi
