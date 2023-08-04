#!/bin/sh

export HC_IP="localhost"

if [ "$NPM_LISTEN_LOCALHOST" = "true" ]; then
    export NPM_IPV4_BINDING="127.0.0.1"
    export NPM_IPV6_BINDING="[::1]"
fi

if [ "$NPM_IPV6_BINDING" != "[::]" ] && [ "$NPM_IPV4_BINDING" != "0.0.0.0" ]; then
    if [ "$NPM_IPV6_BINDING" != "[::]" ] && [ "$DISABLE_IPV6" = "false" ]; then
        export HC_IP="$NPM_IPV6_BINDING"
    fi
    if [ "$NPM_IPV4_BINDING" != "0.0.0.0" ]; then
        export HC_IP="$NPM_IPV4_BINDING"
    fi
fi

if (if [ "$PHP81" = true ]; then cgi-fcgi -bind -connect /dev/php81.sock > /dev/null 2>&1; fi && if [ "$PHP82" = true ]; then cgi-fcgi -bind -connect /dev/php82.sock > /dev/null 2>&1; fi && [ "$(curl -sk https://"$HC_IP":"$NPM_PORT"/api/ | jq --raw-output .status)" = "OK" ]); then
	echo "OK"
	exit 0
else
	echo "NOT OK"
	exit 1
fi
