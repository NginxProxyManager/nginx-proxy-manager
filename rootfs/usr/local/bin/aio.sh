#!/usr/bin/env sh

if [ "$NC_AIO" = "true" ] && [ ! -f /data/aio.lock ]; then
    while [ "$(healthcheck.sh)" != "OK" ]; do sleep 10s; done
    # shellcheck disable=SC2016
    curl -POST http://127.0.0.1:"$NIBEP"/nginx/proxy-hosts -sH 'Content-Type: application/json' -d '{"domain_names":["'"$NC_DOMAIN"'"],"forward_scheme":"http","forward_host":"127.0.0.1","forward_port":11000,"access_list_id":"0","certificate_id":"new","meta":{"letsencrypt_email":"","letsencrypt_agree":true,"dns_challenge":false},"advanced_config":"","locations":[{"path":"/","advanced_config":"proxy_set_header Accept-Encoding $http_accept_encoding;","forward_scheme":"http","forward_host":"127.0.0.1","forward_port":11000}],"block_exploits":false,"caching_enabled":false,"allow_websocket_upgrade":true,"http2_support":true,"hsts_enabled":true,"hsts_subdomains":true,"ssl_forced":true}' -H "Authorization: Bearer $(curl -POST http://127.0.0.1:"$NIBEP"/tokens -sH 'Content-Type: application/json' -d '{"identity":"'"$INITIAL_ADMIN_EMAIL"'"],"secret":"'"$INITIAL_ADMIN_PASSWORD"'"]}' | jq -r .token)"
    touch /data/aio.lock
    echo "The default config for AIO should now be created. Please check the log for any errors and try to resolve them, then delete the aio.lock file and retry."
fi
