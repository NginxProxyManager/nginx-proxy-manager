#!/usr/bin/env sh

if [ "$NC_AIO" = "true" ] && [ ! -f /data/aio.lock ]; then
    export NPM_PORT="${NPM_PORT:-81}"
    export NPM_IPV4_BINDING="${NPM_IPV4_BINDING:-0.0.0.0}"
    if [ "$NPM_IPV4_BINDING" = "0.0.0.0" ]; then
        export NPM_IPV4_BINDING="127.0.0.1"
    fi

    while [ "$(healthcheck.sh)" != "OK" ]; do sleep 10s; done

    if [ "$(curl -POST https://"$NPM_IPV4_BINDING":"$NPM_PORT"/api/tokens -sSkc /tmp/token.cookie -H 'Content-Type: application/json' -d '{"identity":"'"$INITIAL_ADMIN_EMAIL"'","secret":"'"$INITIAL_ADMIN_PASSWORD"'"}' | jq -r .expires)" != null ]; then

        if [ "$(curl -POST https://"$NPM_IPV4_BINDING":"$NPM_PORT"/api/nginx/proxy-hosts -sSkb /tmp/token.cookie -H 'Content-Type: application/json' -d '{"domain_names":["'"$NC_DOMAIN"'"],"forward_scheme":"http","forward_host":"127.0.0.1","forward_port":11000,"access_list_id":0,"caching_enabled":false,"block_exploits":false,"allow_websocket_upgrade":true,"locations":[],"certificate_id":"new","ssl_forced":true,"http2_support":true,"hsts_enabled":true,"hsts_subdomains":true,"advanced_config":"","meta":{}}' | jq -r .error.message)" = null ]; then
            echo
            echo "The default config for AIO should now be created."
            echo
        else
            echo
            echo "There was an error creating the TLS certificate for AIO. Please try to create the cert yourself in the NPMplus UI and update the AIO proxy host to use this cert, see the NPMplus config in the AIO reverse proxy guide as an example for the TLS tab."
            echo
        fi

    else
        echo
        echo "There was an error creating the token required for AIO. Please try to create the cert and proxy host yourself in the NPMplus UI, see the NPMplus config in the AIO reverse proxy guide as an example."
        echo
    fi

    rm -f /tmp/token.cookie
    touch /data/aio.lock
fi
