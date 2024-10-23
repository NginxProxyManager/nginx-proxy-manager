#!/bin/sh

echo "
-------------------------------------
 _ _  ___  __ __       _
| \ || . \|  \  \ ___ | | _ _  ___
|   ||  _/|     || . \| || | |[_-[
|_\_||_|  |_|_|_||  _/|_| \__|/__/
                 |_|
-------------------------------------
Version:  $(jq -r .version /app/package.json)
Date:     $(date)
User:     $(whoami)
PUID:     $PUID
User ID:  $(id -u)
PGID:     $PGID
Group ID: $(id -g)
-------------------------------------
"

if ! nginx -tq; then
    sleep inf
fi

if [ "$PHP82" = "true" ]; then
    if ! PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FORt > /dev/null 2>&1; then
        PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FORt
        sleep inf
    fi
fi

if [ "$PHP83" = "true" ]; then
    if ! PHP_INI_SCAN_DIR=/data/php/83/conf.d php-fpm83 -c /data/php/83 -y /data/php/83/php-fpm.conf -FORt > /dev/null 2>&1; then
        PHP_INI_SCAN_DIR=/data/php/83/conf.d php-fpm83 -c /data/php/83 -y /data/php/83/php-fpm.conf -FORt
        sleep inf
    fi
fi


if [ "$(echo "$ACME_SERVER" | sed "s|^https\?://\([^/]\+\).*$|\1|g")" = "acme.zerossl.com" ] && [ -z "$ACME_EAB_KID" ] && [ -z "$ACME_EAB_HMAC_KEY" ]; then
    if [ -z "$ACME_EMAIL" ]; then
        echo "ACME_EMAIL is required to use zerossl. Either set it or use a different acme server like letsencrypt (ACME_SERVER: https://acme-v02.api.letsencrypt.org/directory)"
        sleep inf
    fi
    
    ZS_EAB="$(curl -s https://api.zerossl.com/acme/eab-credentials-email --data "email=$ACME_EMAIL")"
    export ZS_EAB
    ACME_EAB_KID="$(echo "$ZS_EAB" | jq -r .eab_kid)"
    export ACME_EAB_KID
    ACME_EAB_HMAC_KEY="$(echo "$ZS_EAB" | jq -r .eab_hmac_key)"
    export ACME_EAB_HMAC_KEY
fi

if [ ! -d /data/tls/certbot/accounts/"$(echo "$ACME_SERVER" | sed "s|^https\?://\([^/]\+\).*$|\1|g")" ]; then
    if [ -z "$ACME_EMAIL" ]; then
        if ! certbot --logs-dir /tmp/certbot-log --work-dir /tmp/certbot-work --config-dir /data/tls/certbot --config /etc/tls/certbot.ini --agree-tos --non-interactive --no-eff-email \
                register --server "$ACME_SERVER" --register-unsafely-without-email; then
                    sleep inf
        fi
    elif [ -n "$ACME_EMAIL" ] && [ -z "$ACME_EAB_KID" ] && [ -z "$ACME_EAB_HMAC_KEY" ]; then
        if ! certbot --logs-dir /tmp/certbot-log --work-dir /tmp/certbot-work --config-dir /data/tls/certbot --config /etc/tls/certbot.ini --agree-tos --non-interactive --no-eff-email \
                register --server "$ACME_SERVER" --email "$ACME_EMAIL"; then
                    sleep inf
        fi
    elif [ -n "$ACME_EMAIL" ] && [ -n "$ACME_EAB_KID" ] && [ -n "$ACME_EAB_HMAC_KEY" ]; then
        if ! certbot --logs-dir /tmp/certbot-log --work-dir /tmp/certbot-work --config-dir /data/tls/certbot --config /etc/tls/certbot.ini --agree-tos --non-interactive --no-eff-email \
                register --server "$ACME_SERVER" --eab-kid "$ACME_EAB_KID" --eab-hmac-key "$ACME_EAB_HMAC_KEY" --email "$ACME_EMAIL"; then
                    sleep inf
        fi
    fi
fi


if [ "$PHP82" = "true" ]; then PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FOR; fi &
if [ "$PHP83" = "true" ]; then PHP_INI_SCAN_DIR=/data/php/83/conf.d php-fpm83 -c /data/php/83 -y /data/php/83/php-fpm.conf -FOR; fi &
if [ "$LOGROTATE" = "true" ] && [ "$GOA" = "false" ]; then sleep 1m; while true; do logrotate --verbose --state /data/etc/logrotate.status /etc/logrotate; sleep 25h; done; fi &
if [ "$LOGROTATE" = "true" ] && [ "$GOA" = "true" ]; then sleep 1m; while true; do killall goaccess; sleep 10s; logrotate --verbose --state /data/etc/logrotate.status /etc/logrotate; sleep 25h; done; fi &
# shellcheck disable=SC2086
if [ "$GOA" = "true" ]; then while true; do goaccess --no-global-config --num-tests=0 --tz="$TZ" --date-format="%d/%b/%Y" --time-format="%H:%M:%S" --log-format='[%d:%t %^] %v %h %T "%r" %s %b %b %R %u' --no-ip-validation --addr=127.0.0.1 --port="$GOAIWSP" \
                                -f /data/nginx/access.log --real-time-html -o /tmp/goa/index.html --persist --restore --db-path=/data/etc/goaccess/data -b /etc/goaccess/browsers.list -b /etc/goaccess/podcast.list $GOACLA; done; fi &
aio.sh &
index.js
