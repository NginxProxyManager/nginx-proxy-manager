#!/usr/bin/env sh

if [ "$NC_AIO" = "true" ] && [ ! -f /data/aio.lock ]; then
    while [ "$(healthcheck.sh)" != "OK" ]; do sleep 10s; done
    # shellcheck disable=SC2016
    if ! curl -POST http://127.0.0.1:"$NIBEP"/nginx/proxy-hosts -sSH 'Content-Type: application/json' -d '{"domain_names":["'"$NC_DOMAIN"'"],"forward_scheme":"http","forward_host":"127.0.0.1","forward_port":11000,"allow_websocket_upgrade":true,"access_list_id":"0","certificate_id":"new","ssl_forced":true,"http2_support":true,"hsts_enabled":true,"hsts_subdomains":true,"meta":{"letsencrypt_email":"","letsencrypt_agree":true,"dns_challenge":false},"advanced_config":"","locations":[{"path":"/","advanced_config":"proxy_set_header Accept-Encoding $http_accept_encoding;","forward_scheme":"http","forward_host":"127.0.0.1","forward_port":11000}],"block_exploits":false,"caching_enabled":false}' -H "Authorization: Bearer $(curl -POST http://127.0.0.1:"$NIBEP"/tokens -sSH 'Content-Type: application/json' -d '{"identity":"'"$INITIAL_ADMIN_EMAIL"'","secret":"'"$INITIAL_ADMIN_PASSWORD"'"}' | jq -r .token)" > /dev/null 2>&1; then
        echo
        echo "The default config for AIO should now be created."
        echo
    else
        echo
        echo "There was an error creating the TLS certificate for AIO. Please try to create the cert yourself in the NPMplus UI and update the AIO proxy host to use this cert, see the NPMplus config in the AIO reverse proxy guide as an example for the TLS tab."
        echo
    fi
    touch /data/aio.lock
fi
