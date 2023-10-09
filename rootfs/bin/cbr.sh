#!/bin/sh

while [ "$(healthcheck.sh)" != "OK" ]; do sleep 10s; done
certbot --logs-dir /tmp/certbot-log --work-dir /tmp/certbot-work --config-dir /data/tls/certbot renew --quiet --config "/data/tls/certbot/config.ini" --preferred-challenges "dns,http" --no-random-sleep-on-renew
