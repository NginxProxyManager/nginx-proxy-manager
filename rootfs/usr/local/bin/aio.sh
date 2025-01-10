#!/usr/bin/env sh

if [ "$NC_AIO" = "true" ] && [ ! -f /data/aio.lock ]; then
    while [ "$(healthcheck.sh)" != "OK" ]; do sleep 10s; done
    curl -POST http://127.0.0.1:"$NIBEP"/nginx/proxy-hosts -sH 'Content-Type: application/json' -d '{"domain_names":["'"$NC_DOMAIN"'"],"forward_scheme":"http","forward_host":"127.0.0.1","forward_port":11000,"allow_websocket_upgrade":true,"access_list_id":"0","certificate_id":"new","ssl_forced":true,"http2_support":true,"hsts_enabled":true,"hsts_subdomains":true,"meta":{"letsencrypt_email":"","letsencrypt_agree":true,"dns_challenge":false},"advanced_config":"","locations":[],"block_exploits":false,"caching_enabled":false}' -H "Authorization: Bearer $(curl -POST http://127.0.0.1:"$NIBEP"/tokens -sH 'Content-Type: application/json' -d '{"identity":"admin@example.org","secret":"iArhP1j7p1P6TA92FA2FMbbUGYqwcYzxC4AVEe12Wbi94FY9gNN62aKyF1shrvG4NycjjX9KfmDQiwkLZH1ZDR9xMjiG2QmoHXi"}' | jq -r .token)"
    touch /data/aio.lock
    echo "The default config for AIO should now be created. Please check the log for any errors and try to resolve them, then delete the aio.lock file and retry."
fi
