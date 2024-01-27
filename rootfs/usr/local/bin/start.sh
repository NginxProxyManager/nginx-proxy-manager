#!/bin/sh

if [ "$(whoami)" != "root" ] || [ "$(id -u)" != "0" ] || [ "$(id -g)" != "0" ]; then
	echo '--------------------------------------'
	echo "This docker container must be run as root, do not specify a user."
	echo '--------------------------------------'
    sleep inf
fi

if [ ! -d /data ]; then
	echo '--------------------------------------'
	echo "/data is not mounted! Check your docker configuration."
	echo '--------------------------------------'
    sleep inf
fi


touch /data/.env
. /data/.env


if [ -n "$NPM_CERT_ID" ] && ! echo "$NPM_CERT_ID" | grep -q "^[0-9]\+$"; then
    echo "NPM_CERT_ID needs to be a number."
    echo "NPM_CERT_ID is deprecated, please change it to DEFAULT_CERT_ID"
    sleep inf
fi

if [ -n "$NPM_CERT_ID" ] && [ -z "$DEFAULT_CERT_ID" ]; then
    echo "NPM_CERT_ID is deprecated, please change it to DEFAULT_CERT_ID"
    export DEFAULT_CERT_ID="$NPM_CERT_ID"
fi


if [ -z "$TZ" ] || ! echo "$TZ" | grep -q "^[A-Za-z0-9/_+-]\+$"; then
    echo "TZ is unset or invalid, it can consist of lower and upper letters a-z A-Z, numbers 0-9, slashes, underscores, plus and minus signs."
    sleep inf
fi

if ! echo "$PUID" | grep -q "^[0-9]\+$"; then
    echo "PUID needs to be a number."
    sleep inf
fi

if ! echo "$PGID" | grep -q "^[0-9]\+$"; then
    echo "PGID needs to be a number."
    sleep inf
fi

if ! echo "$NIBEP" | grep -q "^[0-9]\+$"; then
    echo "NIBEP needs to be a number."
    sleep inf
fi

if ! echo "$GOAIWSP" | grep -q "^[0-9]\+$"; then
    echo "GOAIWSP needs to be a number."
    sleep inf
fi

if ! echo "$NPM_PORT" | grep -q "^[0-9]\+$"; then
    echo "NPM_PORT needs to be a number."
    sleep inf
fi

if ! echo "$GOA_PORT" | grep -q "^[0-9]\+$"; then
    echo "GOA_PORT needs to be a number."
    sleep inf
fi

if ! echo "$IPV4_BINDING" | grep -q "^[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+$"; then
    echo "IPV4_BINDING needs to be a IPv4-Address: four blocks of numbers separated by dots."
    sleep inf
fi

if ! echo "$NPM_IPV4_BINDING" | grep -q "^[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+$"; then
    echo "NPM_IPV4_BINDING needs to be a IPv4-Address: four blocks of numbers separated by dots."
    sleep inf
fi

if ! echo "$GOA_IPV4_BINDING" | grep -q "^[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+$"; then
    echo "GOA_IPV4_BINDING needs to be a IPv4-Address: four blocks of numbers separated by dots."
    sleep inf
fi

if ! echo "$IPV6_BINDING" | grep -q "^\[[0-9a-f:]\+\]$"; then
    echo "IPV6_BINDING needs to be a IPv6-Address inside []: lower letters a-f, numbers 0-9 and colons."
    sleep inf
fi

if ! echo "$NPM_IPV6_BINDING" | grep -q "^\[[0-9a-f:]\+\]$"; then
    echo "NPM_IPV6_BINDING needs to be a IPv6-Address inside []: lower letters a-f, numbers 0-9 and colons."
    sleep inf
fi

if ! echo "$GOA_IPV6_BINDING" | grep -q "^\[[0-9a-f:]\+\]$"; then
    echo "GOA_IPV6_BINDING needs to be a IPv6-Address inside []: lower letters a-f, numbers 0-9 and colons."
    sleep inf
fi

if ! echo "$DISABLE_IPV6" | grep -q "^true$\|^false$"; then
    echo "DISABLE_IPV6 needs to be true or false."
    sleep inf
fi

if ! echo "$NPM_DISABLE_IPV6" | grep -q "^true$\|^false$"; then
    echo "NPM_DISABLE_IPV6 needs to be true or false."
    sleep inf
fi

if ! echo "$GOA_DISABLE_IPV6" | grep -q "^true$\|^false$"; then
    echo "GOA_DISABLE_IPV6 needs to be true or false."
    sleep inf
fi

if ! echo "$NPM_LISTEN_LOCALHOST" | grep -q "^true$\|^false$"; then
    echo "NPM_LISTEN_LOCALHOST needs to be true or false."
    sleep inf
fi

if ! echo "$GOA_LISTEN_LOCALHOST" | grep -q "^true$\|^false$"; then
    echo "GOA_LISTEN_LOCALHOST needs to be true or false."
    sleep inf
fi

if ! echo "$DEFAULT_CERT_ID" | grep -q "^[0-9]\+$"; then
    echo "DEFAULT_CERT_ID needs to be a number."
    sleep inf
fi

if ! echo "$DISABLE_HTTP" | grep -q "^true$\|^false$"; then
    echo "DISABLE_HTTP needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_LOG_NOT_FOUND" | grep -q "^true$\|^false$"; then
    echo "NGINX_LOG_NOT_FOUND needs to be true or false."
    sleep inf
fi

if ! echo "$CLEAN" | grep -q "^true$\|^false$"; then
    echo "CLEAN needs to be true or false."
    sleep inf
fi

if ! echo "$FULLCLEAN" | grep -q "^true$\|^false$"; then
    echo "FULLCLEAN needs to be true or false."
    sleep inf
fi

if ! echo "$LOGROTATE" | grep -q "^true$\|^false$"; then
    echo "LOGROTATE needs to be true or false."
    sleep inf
fi

if [ -n "$LOGROTATE" ] && ! echo "$LOGROTATIONS" | grep -q "^[0-9]\+$"; then
    echo "LOGROTATIONS needs to be a number."
    sleep inf
fi

if ! echo "$GOA" | grep -q "^true$\|^false$"; then
    echo "GOA needs to be true or false."
    sleep inf
fi

if [ -n "$GOACLA" ] && ! echo "$GOACLA" | grep -q "^-[a-zA-Z0-9 =/_.-]\+$"; then
    echo "GOACLA must start with a hyphen and can consist of lower and upper letters a-z A-Z, numbers 0-9, spaces, equals signs, slashes, underscores, dots and hyphens."
    sleep inf
fi

if ! echo "$PHP81" | grep -q "^true$\|^false$"; then
    echo "PHP81 needs to be true or false."
    sleep inf
fi

if [ -n "$PHP81_APKS" ] && ! echo "$PHP81_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
    echo "PHP81_APKS can consist of lower letters a-z, numbers 0-9, spaces, underscores and hyphens."
    sleep inf
fi

if ! echo "$PHP82" | grep -q "^true$\|^false$"; then
    echo "PHP82 needs to be true or false."
    sleep inf
fi

if [ -n "$PHP82_APKS" ] && ! echo "$PHP82_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
    echo "PHP82_APKS can consist of lower letters a-z, numbers 0-9, spaces, underscores and hyphens."
    sleep inf
fi


if [ -n "$NC_AIO" ] && ! echo "$NC_AIO" | grep -q "^true$\|^false$"; then
    echo "NC_AIO needs to be true or false."
    sleep inf
fi

if [ -n "$NC_AIO" ] && ! echo "$NC_DOMAIN" | grep -q "^[a-z0-9.]\+$"; then
    echo "NC_DOMAIN can consist of lower letters a-z, numbers 0-9 and dots and is required in AIO mode."
    sleep inf
fi


if [ "$PGID" != "0" ] && [ "$PUID" = "0" ]; then
    echo "You've set PGID but not PUID. Resetting PGID to 0."
    export PGID="0"
fi

if [ "$GOA" = "true" ] && [ "$LOGROTATE" = "false" ]; then
    echo "You've enabled GOA but not LOGROTATE. Enabling LOGROTATE."
    export LOGROTATE="true"
fi

if [ "$NC_AIO" = "true" ]; then
    export DISABLE_HTTP="true"
fi

if [ "$NPM_LISTEN_LOCALHOST" = "true" ]; then
    export NPM_IPV4_BINDING="127.0.0.1"
    export NPM_IPV6_BINDING="[::1]"
fi

if [ "$GOA_LISTEN_LOCALHOST" = "true" ]; then
    export GOA_IPV4_BINDING="127.0.0.1"
    export GOA_IPV6_BINDING="[::1]"
fi


if [ -s /data/etc/goaccess/geoip/GeoLite2-Country.mmdb ] && [ -s /data/etc/goaccess/geoip/GeoLite2-City.mmdb ] && [ -s /data/etc/goaccess/geoip/GeoLite2-ASN.mmdb ] && echo "$GOACLA" | grep -vq "geoip-database"; then
    export GOACLA="$GOACLA --geoip-database=/data/etc/goaccess/geoip/GeoLite2-Country.mmdb --geoip-database=/data/etc/goaccess/geoip/GeoLite2-City.mmdb --geoip-database=/data/etc/goaccess/geoip/GeoLite2-ASN.mmdb"
fi


if [ "$PHP81" = "true" ] || [ "$PHP82" = "true" ] || [ "$PHP83" = "true" ]; then

    apk add --no-cache fcgi

    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP_APKS" ]; then
        for apk in $(echo "$PHP_APKS" | tr " " "\n"); do

            if ! echo "$apk" | grep -q "^php-.*$"; then
                echo "$apk is a non allowed value."
                echo "It needs to start with \"php-\"."
                echo "It is set to \"$apk\"."
                sleep inf
            fi

            echo "Installing $apk via apk..."
            if ! apk add --no-cache "$apk" > /dev/null 2>&1; then
                echo "The apk \"$apk\" was not installed!"
            fi

        done
    fi
fi

if [ "$PHP81" = "true" ]; then

    apk add --no-cache php81-fpm

    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP81_APKS" ]; then
        for apk in $(echo "$PHP81_APKS" | tr " " "\n"); do

            if ! echo "$apk" | grep -q "^php81-.*$"; then
                echo "$apk is a non allowed value."
                echo "It needs to start with \"php81-\"."
                echo "It is set to \"$apk\"."
                sleep inf
            fi

            echo "Installing $apk via apk..."
            if ! apk add --no-cache "$apk" > /dev/null 2>&1; then
                echo "The apk \"$apk\" was not installed!"
            fi

        done
    fi

    mkdir -vp /data/php
    cp -vrnT /etc/php81 /data/php/81
    sed -i "s|listen =.*|listen = /run/php81.sock|" /data/php/81/php-fpm.d/www.conf
    sed -i "s|;error_log =.*|error_log = /proc/self/fd/2|g" /data/php/81/php-fpm.conf
    sed -i "s|include=.*|include=/data/php/81/php-fpm.d/*.conf|g" /data/php/81/php-fpm.conf

elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/php/81
fi

if [ "$PHP82" = "true" ]; then

    apk add --no-cache php82-fpm

    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP82_APKS" ]; then
        for apk in $(echo "$PHP82_APKS" | tr " " "\n"); do

            if ! echo "$apk" | grep -q "^php82-.*$"; then
                echo "$apk is a non allowed value."
                echo "It needs to start with \"php82-\"."
                echo "It is set to \"$apk\"."
                sleep inf
            fi

            echo "Installing $apk via apk..."
            if ! apk add --no-cache "$apk" > /dev/null 2>&1; then
                echo "The apk \"$apk\" was not installed!"
            fi

        done
    fi

    mkdir -vp /data/php
    cp -vrnT /etc/php82 /data/php/82
    sed -i "s|listen =.*|listen = /run/php82.sock|" /data/php/82/php-fpm.d/www.conf
    sed -i "s|;error_log =.*|error_log = /proc/self/fd/2|g" /data/php/82/php-fpm.conf
    sed -i "s|include=.*|include=/data/php/82/php-fpm.d/*.conf|g" /data/php/82/php-fpm.conf

elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/php/82
fi

if [ "$PHP83" = "true" ]; then

    apk add --no-cache php83-fpm

    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP83_APKS" ]; then
        for apk in $(echo "$PHP83_APKS" | tr " " "\n"); do

            if ! echo "$apk" | grep -q "^php83-.*$"; then
                echo "$apk is a non allowed value."
                echo "It needs to start with \"php83-\"."
                echo "It is set to \"$apk\"."
                sleep inf
            fi

            echo "Installing $apk via apk..."
            if ! apk add --no-cache "$apk" > /dev/null 2>&1; then
                echo "The apk \"$apk\" was not installed!"
            fi

        done
    fi

    mkdir -vp /data/php
    cp -vrnT /etc/php83 /data/php/83
    sed -i "s|listen =.*|listen = /run/php83.sock|" /data/php/83/php-fpm.d/www.conf
    sed -i "s|;error_log =.*|error_log = /proc/self/fd/2|g" /data/php/83/php-fpm.conf
    sed -i "s|include=.*|include=/data/php/83/php-fpm.d/*.conf|g" /data/php/83/php-fpm.conf

elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/php/83
fi

if [ "$LOGROTATE" = "true" ]; then
    apk add --no-cache logrotate
    sed -i "s|rotate [0-9]\+|rotate $LOGROTATIONS|g" /etc/logrotate
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/etc/logrotate.status \
            /data/nginx/access.log.*
fi

mkdir -p /tmp/acme-challenge \
         /tmp/certbot-work \
         /tmp/certbot-log \
         /tmp/npmhome \
         /tmp/goa

mkdir -vp /data/tls/certbot/credentials \
          /data/tls/certbot/renewal \
          /data/tls/custom \
          /data/etc/npm \
          /data/etc/html \
          /data/etc/access \
          /data/etc/crowdsec \
          /data/etc/modsecurity \
          /data/nginx/redirection_host \
          /data/nginx/proxy_host \
          /data/nginx/dead_host \
          /data/nginx/stream \
          /data/nginx/custom

if [ -s /data/database.sqlite ] && [ "$DB_SQLITE_FILE" != "/data/database.sqlite" ]; then
    mv -vn /data/database.sqlite "$DB_SQLITE_FILE"
fi

if [ -s /data/keys.json ]; then
    mv -vn /data/keys.json /data/etc/npm/keys.json
fi

if [ -s /data/nginx/default_host/site.conf ]; then
    mv -vn /data/nginx/default_host/site.conf /data/nginx/default.conf
fi

if [ -s /data/nginx/default_www/index.html ]; then
    mv -vn /data/nginx/default_www/index.html /data/nginx/html/index.html
fi

if [ -s /data/nginx/dummycert.pem ]; then
    mv -vn /data/nginx/dummycert.pem /data/tls/dummycert.pem
fi

if [ -s /data/nginx/dummykey.pem ]; then
    mv -vn /data/nginx/dummykey.pem /data/tls/dummykey.pem
fi

if [ -n "$(ls -A /data/nginx/html 2> /dev/null)" ]; then
    mv -vn /data/nginx/html/* /data/etc/html
fi

if [ -n "$(ls -A /data/access 2> /dev/null)" ]; then
    mv -vn /data/access/* /data/etc/access
fi

if [ -n "$(ls -A /data/nginx/access 2> /dev/null)" ]; then
    mv -vn /data/nginx/access/* /data/etc/access
fi

if [ -n "$(ls -A /etc/letsencrypt 2> /dev/null)" ]; then
    mv -v /etc/letsencrypt/* /data/tls/certbot
fi

if [ -n "$(ls -A /data/letsencrypt 2> /dev/null)" ]; then
    mv -vn /data/letsencrypt/* /data/tls/certbot
fi

if [ -n "$(ls -A /data/custom_ssl 2> /dev/null)" ]; then
    mv -vn /data/custom_ssl/* /data/tls/custom
fi

if [ -n "$(ls -A /data/ssl 2> /dev/null)" ]; then
    mv -vn /data/ssl/* /data/tls
fi

if [ "$CLEAN" = "true" ]; then
    rm -vrf /data/letsencrypt-acme-challenge \
            /data/nginx/dummycert.pem \
            /data/nginx/dummykey.pem \
            /data/nginx/default_host \
            /data/nginx/default_www \
            /data/nginx/streams \
            /data/nginx/access \
            /data/nginx/temp \
            /data/nginx/html \
            /data/index.html \
            /data/letsencrypt \
            /data/custom_ssl \
            /data/certbot \
            /data/access \
            /data/php/8 \
            /data/php/7 \
            /data/ssl \
            /data/logs \
            /data/error.log \
            /data/nginx/error.log
    certbot-cleaner.sh
fi

if [ -s "$DB_SQLITE_FILE" ]; then
    sqlite-vaccum.js
fi

if [ "$FULLCLEAN" = "true" ]; then
    if [ "$PHP81" != "true" ] && [ "$PHP82" != "true" ] && [ "$PHP83" != "true" ]; then
        rm -vrf /data/php
    fi
fi

touch /data/etc/html/index.html \
      /data/nginx/ip_ranges.conf \
      /data/nginx/custom/root.conf \
      /data/nginx/custom/events.conf \
      /data/nginx/custom/http.conf \
      /data/nginx/custom/http_top.conf \
      /data/nginx/custom/server_dead.conf \
      /data/nginx/custom/server_proxy.conf \
      /data/nginx/custom/server_redirect.conf \
      /data/nginx/custom/stream.conf \
      /data/nginx/custom/stream_top.conf \
      /data/nginx/custom/server_stream.conf \
      /data/nginx/custom/server_stream_tcp.conf \
      /data/nginx/custom/server_stream_udp.conf \
      /data/etc/modsecurity/modsecurity-extra.conf

find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s| http2||g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|\(listen .*\) http3|\1 quic|g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|quic reuseport;|quic;|g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|security_headers on;|include conf.d/include/hsts.conf;|g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|more_set_headers \"Alt-Svc: h3=':443'; ma=86400\";|more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';|g" {} \;

find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|/data/access|/data/nginx/access|g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|/data/nginx/access|/data/etc/access|g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|/data/nginx/html/|/data/etc/html/|g" {} \;

find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|/data/custom_ssl|/data/tls/custom|g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|/etc/letsencrypt|/data/tls/certbot|g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|/data/letsencrypt|/data/tls/certbot|g" {} \;

find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|/data/ssl|/data/tls|g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|ssl_certificate_key /data/nginx/dummykey.pem;|ssl_certificate_key /data/tls/dummykey.pem;|g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|ssl_certificate /data/nginx/dummycert.pem;|ssl_certificate /data/tls/dummycert.pem;|g" {} \;

find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/data/ssl|/data/tls|g" {} \;
find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/etc/letsencrypt|/data/tls/certbot|g" {} \;
find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/data/letsencrypt|/data/tls/certbot|g" {} \;

find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|include conf.d/include/force-ssl.conf;|include conf.d/include/force-tls.conf;|g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|include conf.d/include/ssl-ciphers.conf;|include conf.d/include/tls-ciphers.conf;|g" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|include conf.d/include/letsencrypt-acme-challenge.conf;|include conf.d/include/acme-challenge.conf;|g" {} \;

find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "/http3/d" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "/Asset Caching/d" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "/assets.conf/d" {} \;

find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "/error_log/d" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "/access_log/d" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "/proxy_http_version/d" {} \;

find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "/ssl_stapling/d" {} \;
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "/ssl_stapling_verify/d" {} \;

if [ ! -s /data/etc/modsecurity/modsecurity-default.conf ]; then
      cp -vn /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example /data/etc/modsecurity/modsecurity-default.conf
fi
cp /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example /data/etc/modsecurity/modsecurity-default.conf.example

if [ -s /data/etc/modsecurity/modsecurity.conf ]; then
      mv -v /data/etc/modsecurity/modsecurity.conf /data/etc/modsecurity/modsecurity-extra.conf
fi

if [ ! -s /data/etc/modsecurity/crs-setup.conf ]; then
      cp -vn /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example /data/etc/modsecurity/crs-setup.conf
fi
cp /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example /data/etc/modsecurity/crs-setup.conf.example

if [ ! -s /data/etc/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example ]; then
      cp -vn /usr/local/nginx/conf/conf.d/include/coreruleset/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example /data/etc/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf
fi
cp /usr/local/nginx/conf/conf.d/include/coreruleset/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example /data/etc/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example

if [ ! -s /data/etc/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example ]; then
      cp -vn /usr/local/nginx/conf/conf.d/include/coreruleset/rules/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example /data/etc/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf
fi
cp /usr/local/nginx/conf/conf.d/include/coreruleset/rules/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example /data/etc/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example


if [ "$DEFAULT_CERT_ID" = "0" ]; then
    export DEFAULT_CERT=/data/tls/dummycert.pem
    export DEFAULT_KEY=/data/tls/dummykey.pem
    echo "no DEFAULT_CERT_ID set, using dummycerts."
else
        if [ -d "/data/tls/certbot/live/npm-$DEFAULT_CERT_ID" ]; then
            if [ ! -s /data/tls/certbot/live/npm-"$DEFAULT_CERT_ID"/fullchain.pem ]; then
                echo "/data/tls/certbot/live/npm-$DEFAULT_CERT_ID/fullchain.pem does not exist"
                export DEFAULT_CERT=/data/tls/dummycert.pem
                export DEFAULT_KEY=/data/tls/dummykey.pem
                echo "using dummycerts."
            else
                export DEFAULT_CERT=/data/tls/certbot/live/npm-"$DEFAULT_CERT_ID"/fullchain.pem
                echo "DEFAULT_CERT set to /data/tls/certbot/live/npm-$DEFAULT_CERT_ID/fullchain.pem"

                if [ ! -s /data/tls/certbot/live/npm-"$DEFAULT_CERT_ID"/privkey.pem ]; then
                    echo "/data/tls/certbot/live/npm-$DEFAULT_CERT_ID/privkey.pem does not exist"
                    export DEFAULT_CERT=/data/tls/dummycert.pem
                    export DEFAULT_KEY=/data/tls/dummykey.pem
                    echo "using dummycerts."
                else
                    export DEFAULT_KEY=/data/tls/certbot/live/npm-"$DEFAULT_CERT_ID"/privkey.pem
                    echo "DEFAULT_KEY set to /data/tls/certbot/live/npm-$DEFAULT_CERT_ID/privkey.pem"

                    if [ ! -s /data/tls/certbot/live/npm-"$DEFAULT_CERT_ID"/chain.pem ]; then
                        echo "/data/tls/certbot/live/npm-$DEFAULT_CERT_ID/chain.pem does not exist, running without it"
                    else
                        export DEFAULT_CHAIN=/data/tls/certbot/live/npm-"$DEFAULT_CERT_ID"/chain.pem
                        echo "DEFAULT_CHAIN set to /data/tls/certbot/live/npm-$DEFAULT_CERT_ID/chain.pem"
                    fi
                fi
            fi

        elif [ -d "/data/tls/custom/npm-$DEFAULT_CERT_ID" ]; then
            if [ ! -s /data/tls/custom/npm-"$DEFAULT_CERT_ID"/fullchain.pem ]; then
                echo "/data/tls/custom/npm-$DEFAULT_CERT_ID/fullchain.pem does not exist"
                export DEFAULT_CERT=/data/tls/dummycert.pem
                export DEFAULT_KEY=/data/tls/dummykey.pem
                echo "using dummycerts."
            else
                export DEFAULT_CERT=/data/tls/custom/npm-"$DEFAULT_CERT_ID"/fullchain.pem
                echo "DEFAULT_CERT set to /data/tls/custom/npm-$DEFAULT_CERT_ID/fullchain.pem"

                if [ ! -s /data/tls/custom/npm-"$DEFAULT_CERT_ID"/privkey.pem ]; then
                    echo "/data/tls/custom/npm-$DEFAULT_CERT_ID/privkey.pem does not exist"
                    export DEFAULT_CERT=/data/tls/dummycert.pem
                    export DEFAULT_KEY=/data/tls/dummykey.pem
                    echo "using dummycerts."
                else
                    export DEFAULT_KEY=/data/tls/custom/npm-"$DEFAULT_CERT_ID"/privkey.pem
                    echo "DEFAULT_KEY set to /data/tls/custom/npm-$DEFAULT_CERT_ID/privkey.pem"

                    if [ ! -s /data/tls/custom/npm-"$DEFAULT_CERT_ID"/chain.pem ]; then
                        echo "/data/tls/custom/npm-$DEFAULT_CERT_ID/chain.pem does not exist, running without it"
                    else
                        export DEFAULT_CHAIN=/data/tls/custom/npm-"$DEFAULT_CERT_ID"/chain.pem
                        echo "DEFAULT_CHAIN set to /data/tls/custom/npm-$DEFAULT_CERT_ID/chain.pem"
                    fi
                fi
            fi

        else
            export DEFAULT_CERT=/data/tls/dummycert.pem
            export DEFAULT_KEY=/data/tls/dummykey.pem
            echo "cert with ID $DEFAULT_CERT_ID does not exist, using dummycerts."
        fi
fi

if [ "$DEFAULT_CERT" = "/data/tls/dummycert.pem" ] && [ "$DEFAULT_KEY" != "/data/tls/dummykey.pem" ]; then
    export DEFAULT_CERT=/data/tls/dummycert.pem
    export DEFAULT_KEY=/data/tls/dummykey.pem
    echo "something went wrong, using dummycerts."
fi
if [ "$DEFAULT_CERT" != "/data/tls/dummycert.pem" ] && [ "$DEFAULT_KEY" = "/data/tls/dummykey.pem" ]; then
    export DEFAULT_CERT=/data/tls/dummycert.pem
    export DEFAULT_KEY=/data/tls/dummykey.pem
    echo "something went wrong, using dummycerts."
fi

if [ "$DEFAULT_CERT" = "/data/tls/dummycert.pem" ] || [ "$DEFAULT_KEY" = "/data/tls/dummykey.pem" ]; then
    if [ ! -s /data/tls/dummycert.pem ] || [ ! -s /data/tls/dummykey.pem ]; then
        rm -vrf /data/tls/dummycert.pem \
            /data/tls/dummykey.pem
        openssl req -new -newkey rsa:4096 -days 365000 -nodes -x509 -subj '/CN=*' -sha256 -keyout /data/tls/dummykey.pem -out /data/tls/dummycert.pem
    fi
else
    rm -vrf /data/tls/dummycert.pem \
            /data/tls/dummykey.pem
fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /app/templates/default.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /app/templates/default.conf
if [ -n "$DEFAULT_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $DEFAULT_CHAIN;|g" /app/templates/default.conf; fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/include/default.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/include/default.conf
if [ -n "$DEFAULT_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $DEFAULT_CHAIN;|g" /usr/local/nginx/conf/conf.d/include/default.conf; fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
if [ -n "$DEFAULT_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $DEFAULT_CHAIN;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf; fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/npm.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/npm.conf
if [ -n "$DEFAULT_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $DEFAULT_CHAIN;|g" /usr/local/nginx/conf/conf.d/npm.conf; fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
if [ -n "$DEFAULT_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $DEFAULT_CHAIN;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf; fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
if [ -n "$DEFAULT_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $DEFAULT_CHAIN;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf; fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf
if [ -n "$DEFAULT_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $DEFAULT_CHAIN;|g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf; fi


if [ "$DISABLE_IPV6" = "true" ]; then
    sed -i "s|#\?resolver .*|resolver local=on valid=10s ipv6=off;|g" /usr/local/nginx/conf/nginx.conf
else
    sed -i "s|#\?resolver .*|resolver local=on valid=10s;|g" /usr/local/nginx/conf/nginx.conf
fi

sed -i "s|48693|$NIBEP|g" /app/index.js
sed -i "s|48693|$NIBEP|g" /usr/local/nginx/conf/conf.d/npm.conf

sed -i "s|48683|$GOAIWSP|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf

sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\({{ incoming_port }}\)/listen $IPV4_BINDING:\2/g" /app/templates/stream.conf
sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $IPV4_BINDING:\2/g" /usr/local/nginx/conf/conf.d/no-server-name.conf
find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $IPV4_BINDING:\2/g" {} \;
find /app/templates -type f -name '*.conf' -not -path "/app/templates/stream.conf" -exec sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $IPV4_BINDING:\2/g" {} \;
find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $IPV4_BINDING:\2/g" {} \;

if [ "$DISABLE_IPV6" = "true" ]; then
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\({{ incoming_port }}\)/#listen \[\1\]:\2/g" /app/templates/stream.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" /usr/local/nginx/conf/conf.d/no-server-name.conf
    find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" {} \;
    find /app/templates -type f -name '*.conf' -not -path "/app/templates/stream.conf" -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" {} \;
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" {} \;
else
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\({{ incoming_port }}\)/listen $IPV6_BINDING:\2/g" /app/templates/stream.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $IPV6_BINDING:\2/g" /usr/local/nginx/conf/conf.d/no-server-name.conf
    find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $IPV6_BINDING:\2/g" {} \;
    find /app/templates -type f -name '*.conf' -not -path "/app/templates/stream.conf" -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $IPV6_BINDING:\2/g" {} \;
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $IPV6_BINDING:\2/g" {} \;
fi

sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $NPM_IPV4_BINDING:$NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm.conf
sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $NPM_IPV4_BINDING:$NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf

if [ "$NPM_DISABLE_IPV6" = "true" ]; then
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
else
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $NPM_IPV6_BINDING:$NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $NPM_IPV6_BINDING:$NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
fi

sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $GOA_IPV4_BINDING:$GOA_PORT/g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $GOA_IPV4_BINDING:$GOA_PORT/g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf

if [ "$GOA_DISABLE_IPV6" = "true" ]; then
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf
else
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $GOA_IPV6_BINDING:$GOA_PORT/g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $GOA_IPV6_BINDING:$GOA_PORT/g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf
fi

if [ "$DISABLE_HTTP" = "true" ]; then
    find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|#\?\(listen.*80\)|#\1|g" {} \;
    find /app/templates -type f -name '*.conf' -not -path "/app/templates/stream.conf" -exec sed -i "s|#\?\(listen.*80\)|#\1|g" {} \;
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|#\1|g" {} \;
else
    find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|#\?\(listen.*80\)|\1|g" {} \;
    find /app/templates -type f -name '*.conf' -not -path "/app/templates/stream.conf" -exec sed -i "s|#\?\(listen.*80\)|\1|g" {} \;
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|\1|g" {} \;
fi

if [ "$NGINX_LOG_NOT_FOUND" = "true" ]; then
    sed -i "s|log_not_found.*|log_not_found on;|g" /usr/local/nginx/conf/nginx.conf
else
    sed -i "s|log_not_found.*|log_not_found off;|g" /usr/local/nginx/conf/nginx.conf
fi

if [ "$LOGROTATE" = "true" ]; then
    sed -i "s|access_log.*|access_log /data/nginx/access.log log;|g" /usr/local/nginx/conf/nginx.conf
else
    sed -i "s|access_log.*|access_log off;|g" /usr/local/nginx/conf/nginx.conf
fi

if [ ! -s /data/nginx/default.conf ]; then
    cp -vn /usr/local/nginx/conf/conf.d/include/default.conf /data/nginx/default.conf
fi
sed -i "s|quic default_server|quic reuseport default_server|g" /data/nginx/default.conf

if [ ! -s /data/tls/certbot/config.ini ]; then
    cp -vn /etc/tls/certbot.ini /data/tls/certbot/config.ini
fi
cp /etc/tls/certbot.ini /data/tls/certbot/config.ini.example

if [ ! -s /data/etc/crowdsec/ban.html ]; then
    cp -vn /usr/local/nginx/conf/conf.d/include/ban.html /data/etc/crowdsec/ban.html
fi
cp /usr/local/nginx/conf/conf.d/include/ban.html /data/etc/crowdsec/ban.html.example

if [ ! -s /data/etc/crowdsec/captcha.html ]; then
    cp -vn /usr/local/nginx/conf/conf.d/include/captcha.html /data/etc/crowdsec/captcha.html
fi
cp /usr/local/nginx/conf/conf.d/include/captcha.html /data/etc/crowdsec/captcha.html.example

if [ ! -s /data/etc/crowdsec/crowdsec.conf ]; then
    cp -vn /usr/local/nginx/conf/conf.d/include/crowdsec.conf /data/etc/crowdsec/crowdsec.conf
fi
cp /usr/local/nginx/conf/conf.d/include/crowdsec.conf /data/etc/crowdsec/crowdsec.conf.example
sed -i "s|crowdsec.conf|captcha.html|g" /data/etc/crowdsec/crowdsec.conf

if grep -iq "^ENABLED[ ]*=[ ]*true$" /data/etc/crowdsec/crowdsec.conf; then
    if [ ! -s /usr/local/nginx/conf/conf.d/crowdsec.conf ]; then
        cp -vn /usr/local/nginx/conf/conf.d/include/crowdsec_nginx.conf /usr/local/nginx/conf/conf.d/crowdsec.conf
    fi
else
    rm -vf /usr/local/nginx/conf/conf.d/crowdsec.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /data/nginx/default.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /data/nginx/default.conf
if [ -n "$DEFAULT_CHAIN" ]; then sed -i "s|ssl_trusted_certificate .*|ssl_trusted_certificate $DEFAULT_CHAIN;|g" /data/nginx/default.conf; fi

if [ "$GOA" = "true" ]; then
    apk add --no-cache goaccess
    mkdir -vp /data/etc/goaccess/data \
              /data/etc/goaccess/geoip
    cp -vn /usr/local/nginx/conf/conf.d/include/goaccess.conf /usr/local/nginx/conf/conf.d/goaccess.conf
    cp -vn /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf /usr/local/nginx/conf/conf.d/goaccess-no-server-name.conf
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/etc/goaccess
fi

nginxbeautifier -s 4 -r /data/nginx

#find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|add_header alt-svc 'h3=\":443\"; ma=86400, h3-29=\":443\"; ma=86400';|add_header Alt-Svc 'h3=\":443\"; ma=86400';|g" {} \;
#find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "s|add_header alt-svc 'h3=\":443\";|add_header Alt-Svc 'h3=\":443\"; ma=86400';|g" {} \;
#find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "/ma=86400, h3-29=\":443\";/d" {} \;
#find /data/nginx -type f -name '*.conf' -not -path "/data/nginx/custom/*" -exec sed -i "/^[[:space:]]*ma=86400';[[:space:]]*$/d" {} \;

rm -vf /usr/local/nginx/logs/nginx.pid
rm -vf /run/*.sock

chmod -R 770 /data/tls \
             /data/etc/npm \
             /data/etc/access

if [ "$PUID" != "0" ]; then
    if id -u npm > /dev/null 2>&1; then
        usermod -u "$PUID" npm
    else
        useradd -o -u "$PUID" -U -d /tmp/npmhome -s /sbin/nologin npm
    fi
    if [ -z "$(getent group npm | cut -d: -f3)" ]; then
        groupadd -f -g "$PGID" npm
    else
        groupmod -o -g "$PGID" npm
    fi
    groupmod -o -g "$PGID" npm
    if [ "$(getent group npm | cut -d: -f3)" != "$PGID" ]; then
        echo "ERROR: Unable to set group id properly"
        sleep inf
    fi
    usermod -G "$PGID" npm
    if [ "$(id -g npm)" != "$PGID" ] ; then
        echo "ERROR: Unable to set group against the user properly"
        sleep inf
    fi
    chown -R "$PUID:$PGID" /usr/local \
                           /data \
                           /run \
                           /tmp
    if [ "$PHP81" = "true" ]; then
        sed -i "s|user =.*|;user = root|" /data/php/81/php-fpm.d/www.conf
        sed -i "s|group =.*|;group = root|" /data/php/81/php-fpm.d/www.conf
    fi
    if [ "$PHP82" = "true" ]; then
        sed -i "s|user =.*|;user = root|" /data/php/82/php-fpm.d/www.conf
        sed -i "s|group =.*|;group = root|" /data/php/82/php-fpm.d/www.conf
    fi
    if [ "$PHP83" = "true" ]; then
        sed -i "s|user =.*|;user = root|" /data/php/83/php-fpm.d/www.conf
        sed -i "s|group =.*|;group = root|" /data/php/83/php-fpm.d/www.conf
    fi
    sed -i "s|user root;|#user root;|g" /usr/local/nginx/conf/nginx.conf
    exec sudo -Eu npm launch.sh
else
    chown -R 0:0 /usr/local \
                 /data \
                 /run \
                 /tmp
    if [ "$PHP81" = "true" ]; then
        sed -i "s|;user =.*|user = root|" /data/php/81/php-fpm.d/www.conf
        sed -i "s|;group =.*|group = root|" /data/php/81/php-fpm.d/www.conf
    fi
    if [ "$PHP82" = "true" ]; then
        sed -i "s|;user =.*|user = root|" /data/php/82/php-fpm.d/www.conf
        sed -i "s|;group =.*|group = root|" /data/php/82/php-fpm.d/www.conf
    fi
    if [ "$PHP83" = "true" ]; then
        sed -i "s|;user =.*|user = root|" /data/php/83/php-fpm.d/www.conf
        sed -i "s|;group =.*|group = root|" /data/php/83/php-fpm.d/www.conf
    fi
    sed -i "s|#user root;|user root;|g"  /usr/local/nginx/conf/nginx.conf
    exec launch.sh
fi
