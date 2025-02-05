#!/usr/bin/env sh

echo "
-------------------------------------
User:     $(whoami)
PUID:     $PUID
User ID:  $(id -u)
PGID:     $PGID
Group ID: $(id -g)
-------------------------------------
"

if [ ! -d /data/tls/certbot/accounts/"$(echo "$ACME_SERVER" | sed "s|^https\?://\([^/]\+\).*$|\1|g")" ]; then
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
    if [ -z "$ACME_EMAIL" ]; then
        if ! certbot --logs-dir /tmp/certbot-log --work-dir /tmp/certbot-work --config-dir /data/tls/certbot --config /etc/certbot.ini --agree-tos --non-interactive --no-eff-email \
                register --server "$ACME_SERVER" --register-unsafely-without-email; then
                    sleep inf
        fi
    elif [ -n "$ACME_EMAIL" ] && [ -z "$ACME_EAB_KID" ] && [ -z "$ACME_EAB_HMAC_KEY" ]; then
        if ! certbot --logs-dir /tmp/certbot-log --work-dir /tmp/certbot-work --config-dir /data/tls/certbot --config /etc/certbot.ini --agree-tos --non-interactive --no-eff-email \
                register --server "$ACME_SERVER" --email "$ACME_EMAIL"; then
                    sleep inf
        fi
    elif [ -n "$ACME_EMAIL" ] && [ -n "$ACME_EAB_KID" ] && [ -n "$ACME_EAB_HMAC_KEY" ]; then
        if ! certbot --logs-dir /tmp/certbot-log --work-dir /tmp/certbot-work --config-dir /data/tls/certbot --config /etc/certbot.ini --agree-tos --non-interactive --no-eff-email \
                register --server "$ACME_SERVER" --eab-kid "$ACME_EAB_KID" --eab-hmac-key "$ACME_EAB_HMAC_KEY" --email "$ACME_EMAIL"; then
                    sleep inf
        fi
    fi
    echo
fi

if [ "$ACME_OCSP_STAPLING" = "true" ]; then
    certbot-ocsp-fetcher.sh -c /data/tls/certbot/live -o /data/tls/certbot/live --no-reload-webserver --force-update || true
    echo
else
    find /data/nginx -type f -name '*.conf' -exec sed -i "/ssl_stapling_file \/data\/tls\/certbot\/live\/npm-[0-9]\+.der;/d" {} \;
fi

if [ "$CUSTOM_OCSP_STAPLING" = "true" ]; then
    certbot-ocsp-fetcher.sh -c /data/tls/custom -o /data/tls/custom --no-reload-webserver --force-update || true
    echo
else
    find /data/nginx -type f -name '*.conf' -exec sed -i "/ssl_stapling_file \/data\/tls\/custom\/npm-[0-9]\+.der;/d" {} \;
fi

if [ "$LOGROTATE" = "true" ]; then touch /data/logrotate.lock; else rm -f /data/logrotate.lock; fi


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
if [ "$PHP84" = "true" ]; then
    if ! PHP_INI_SCAN_DIR=/data/php/84/conf.d php-fpm84 -c /data/php/84 -y /data/php/84/php-fpm.conf -FORt > /dev/null 2>&1; then
        PHP_INI_SCAN_DIR=/data/php/84/conf.d php-fpm84 -c /data/php/84 -y /data/php/84/php-fpm.conf -FORt
        sleep inf
    fi
fi


echo "Starting services..."
if [ "$PHP82" = "true" ]; then PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FOR; fi &
if [ "$PHP83" = "true" ]; then PHP_INI_SCAN_DIR=/data/php/83/conf.d php-fpm83 -c /data/php/83 -y /data/php/83/php-fpm.conf -FOR; fi &
if [ "$PHP84" = "true" ]; then PHP_INI_SCAN_DIR=/data/php/84/conf.d php-fpm84 -c /data/php/84 -y /data/php/84/php-fpm.conf -FOR; fi &
if [ "$LOGROTATE" = "true" ]; then while true; do touch /data/logrotate.lock; logrotate --verbose --state /data/logrotate.state /etc/logrotate; rm /data/logrotate.lock; sleep 25h; done; fi &
# shellcheck disable=SC2086
if [ "$GOA" = "true" ]; then while true; do if [ -f /data/nginx/access.log ] && [ ! -f /data/logrotate.lock ]; then goaccess --no-global-config --num-tests=0 --tz="$TZ" --date-format="%d/%b/%Y" --time-format="%H:%M:%S" --log-format='[%d:%t %^] %v %h %T "%r" %s %b %b %R %u' --no-ip-validation \
                        --addr=127.0.0.1 --port="$GOAIWSP" -f /data/nginx/access.log --real-time-html -o /tmp/goa/index.html --persist --restore --db-path=/data/goaccess/data -b /etc/goaccess/browsers.list -b /etc/goaccess/podcast.list $GOACLA; else sleep 10s; fi; done; fi &
nginx -e stderr &
aio.sh &
index.js
