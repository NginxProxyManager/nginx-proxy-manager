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


if [ -n "$NPM_CERT_ID" ]; then
    echo "NPM_CERT_ID env is replaced by DEFAULT_CERT_ID, please change it to DEFAULT_CERT_ID"
    sleep inf
fi

if [ -n "$LE_SERVER" ]; then
    echo "LE_SERVER env is replaced by ACME_SERVER, please change it to ACME_SERVER"
    sleep inf
fi

if [ -n "$DEBUG" ]; then
    echo "DEBUG env is unsopported."
    sleep inf
fi

if [ -n "$X_FRAME_OPTIONS" ]; then
    echo "X_FRAME_OPTIONS env is unsopported."
    sleep inf
fi

if [ -n "$LE_STAGING" ]; then
    echo "LE_STAGING env is unsopported, please use ACME_SERVER."
    sleep inf
fi

if [ -n "$PHP81" ]; then
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|fastcgi_pass php81;|fastcgi_pass php82;|g" {} \;
    echo "PHP81 was removed, please use PHP82 or PHP83"
    sleep inf
fi

if [ -n "$PHP81_APKS" ]; then
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|fastcgi_pass php81;|fastcgi_pass php82;|g" {} \;
    echo "PHP81_APKS was removed, please use PHP82_APKS or PHP83_APKS"
    sleep inf
fi


if [ -z "$TZ" ] || ! echo "$TZ" | grep -q "^[A-Za-z0-9_+-]\+/[A-Za-z0-9_+-]\+$"; then
    echo "TZ is unset or invalid, it can consist of lower and upper letters a-z A-Z, numbers 0-9, underscores, plus and minus signs which are split by a slash."
    sleep inf
fi


if ! echo "$ACME_SERVER" | grep -q "^https\?://.\+$"; then
    echo "ACME_SERVER needs to start with http:// or https://"
    sleep inf
fi

if [ -n "$ACME_EMAIL" ] && ! echo "$ACME_EMAIL" | grep -q "^.*@.*$"; then
    echo "ACME_EMAIL needs to contains @."
    sleep inf
fi

if { [ -n "$ACME_EAB_KID" ] || [ -n "$ACME_EAB_HMAC_KEY" ]; } && { [ -z "$ACME_EAB_KID" ] || [ -z "$ACME_EAB_HMAC_KEY" ] || [ -z "$ACME_EMAIL" ]; }; then
    echo "You need to set ACME_EAB_KID, ACME_EAB_HMAC_KEY AND ACME_EMAIL (all are needed) or none of them or ONLY ACME_EMAIL."
    sleep inf
fi

if ! echo "$ACME_MUST_STAPLE" | grep -q "^true$\|^false$"; then
    echo "ACME_MUST_STAPLE needs to be true or false."
    sleep inf
fi

if ! echo "$ACME_SERVER_TLS_VERIFY" | grep -q "^true$\|^false$"; then
    echo "ACME_SERVER_TLS_VERIFY needs to be true or false."
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

if [ "$PGID" != "0" ] && [ "$PUID" = "0" ]; then
    echo "You've set PGID but not PUID. Which is required."
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


if ! echo "$NPM_LISTEN_LOCALHOST" | grep -q "^true$\|^false$"; then
    echo "NPM_LISTEN_LOCALHOST needs to be true or false."
    sleep inf
fi

if [ "$NPM_LISTEN_LOCALHOST" = "true" ]; then
    export NPM_IPV4_BINDING="127.0.0.1"
    export NPM_IPV6_BINDING="[::1]"
fi


if ! echo "$GOA_LISTEN_LOCALHOST" | grep -q "^true$\|^false$"; then
    echo "GOA_LISTEN_LOCALHOST needs to be true or false."
    sleep inf
fi

if [ "$GOA_LISTEN_LOCALHOST" = "true" ]; then
    export GOA_IPV4_BINDING="127.0.0.1"
    export GOA_IPV6_BINDING="[::1]"
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


if ! echo "$DEFAULT_CERT_ID" | grep -q "^[0-9]\+$"; then
    echo "DEFAULT_CERT_ID needs to be a number."
    sleep inf
fi

if ! echo "$DISABLE_HTTP" | grep -q "^true$\|^false$"; then
    echo "DISABLE_HTTP needs to be true or false."
    sleep inf
fi

if ! echo "$DISABLE_H3_QUIC" | grep -q "^true$\|^false$"; then
    echo "DISABLE_H3_QUIC needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_LOG_NOT_FOUND" | grep -q "^true$\|^false$"; then
    echo "NGINX_LOG_NOT_FOUND needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_404_REDIRECT" | grep -q "^true$\|^false$"; then
    echo "NGINX_404_REDIRECT needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_DISABLE_PROXY_BUFFERING" | grep -q "^true$\|^false$"; then
    echo "NGINX_DISABLE_PROXY_BUFFERING needs to be true or false."
    sleep inf
fi

if ! echo "$DISABLE_NGINX_BEAUTIFIER" | grep -q "^true$\|^false$"; then
    echo "DISABLE_NGINX_BEAUTIFIER needs to be true or false."
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

if ! echo "$SKIP_IP_RANGES" | grep -q "^true$\|^false$"; then
    echo "SKIP_IP_RANGES needs to be true or false."
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

if ! echo "$CRT" | grep -q "^[0-9]\+$"; then
    echo "CRT needs to be a number."
    sleep inf
fi

if ! echo "$IPRT" | grep -q "^[0-9]\+$"; then
    echo "IPRT needs to be a number."
    sleep inf
fi


if ! echo "$GOA" | grep -q "^true$\|^false$"; then
    echo "GOA needs to be true or false."
    sleep inf
fi

if [ "$GOA" = "true" ] && [ "$LOGROTATE" = "false" ]; then
    echo "You've enabled GOA but not LOGROTATE. Which is required."
    sleep inf
fi

if echo "$GOACLA" | grep -vq "geoip-database"; then
    if [ -s /data/etc/goaccess/geoip/GeoLite2-City.mmdb ]; then
        export GOACLA="$GOACLA --geoip-database=/data/etc/goaccess/geoip/GeoLite2-City.mmdb"
    fi
    if [ -s /data/etc/goaccess/geoip/GeoLite2-Country.mmdb ]; then
        export GOACLA="$GOACLA --geoip-database=/data/etc/goaccess/geoip/GeoLite2-Country.mmdb"
    fi
    if [ -s /data/etc/goaccess/geoip/GeoLite2-ASN.mmdb ]; then
        export GOACLA="$GOACLA --geoip-database=/data/etc/goaccess/geoip/GeoLite2-ASN.mmdb"
    fi
fi

if [ -n "$GOACLA" ] && ! echo "$GOACLA" | grep -q "^-[a-zA-Z0-9 =/_.-]\+$"; then
    echo "GOACLA must start with a hyphen and can consist of lower and upper letters a-z A-Z, numbers 0-9, spaces, equals signs, slashes, underscores, dots and hyphens."
    sleep inf
fi


if [ -n "$PHP_APKS" ] && [ "$PHP82" = "false" ] && [ "$PHP83" = "false" ]; then
    echo "PHP_APKS is set, but PHP82 and PHP83 is disabled."
    sleep inf
fi


if ! echo "$PHP82" | grep -q "^true$\|^false$"; then
    echo "PHP82 needs to be true or false."
    sleep inf
fi

if [ -n "$PHP82_APKS" ] && [ "$PHP82" = "false" ]; then
    echo "PHP82_APKS is set, but PHP82 is disabled."
    sleep inf
fi

if [ -n "$PHP82_APKS" ] && ! echo "$PHP82_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
    echo "PHP82_APKS can consist of lower letters a-z, numbers 0-9, spaces, underscores and hyphens."
    sleep inf
fi


if ! echo "$PHP83" | grep -q "^true$\|^false$"; then
    echo "PHP83 needs to be true or false."
    sleep inf
fi

if [ -n "$PHP83_APKS" ] && [ "$PHP83" = "false" ]; then
    echo "PHP83_APKS is set, but PHP83 is disabled."
    sleep inf
fi

if [ -n "$PHP83_APKS" ] && ! echo "$PHP83_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
    echo "PHP83_APKS can consist of lower letters a-z, numbers 0-9, spaces, underscores and hyphens."
    sleep inf
fi


if [ -n "$INITIAL_ADMIN_EMAIL" ] && ! echo "$INITIAL_ADMIN_EMAIL" | grep -q "^.*@.*$"; then
    echo "INITIAL_ADMIN_EMAIL needs to contains @."
    sleep inf
fi


if [ -n "$NC_AIO" ] && ! echo "$NC_AIO" | grep -q "^true$\|^false$"; then
    echo "NC_AIO needs to be true or false."
    sleep inf
fi

if [ "$NC_AIO" = "true" ] && ([ -z "$NC_DOMAIN" ] || ! echo "$NC_DOMAIN" | grep -q "^[a-z0-9.]\+$"); then
    echo "NC_DOMAIN must consist of lower letters a-z, numbers 0-9 and dots and is required in AIO mode."
    sleep inf
fi

if [ "$NC_AIO" = "true" ]; then
    export DISABLE_HTTP="true"
fi



if [ "$ACME_MUST_STAPLE" = "true" ]; then
    sed -i "s|must-staple = .*|must-staple = true|g" /etc/certbot.ini
else
    sed -i "s|must-staple = .*|must-staple = false|g" /etc/certbot.ini
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
    cp -varnT /etc/php82 /data/php/82
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
    cp -varnT /etc/php83 /data/php/83
    sed -i "s|listen =.*|listen = /run/php83.sock|" /data/php/83/php-fpm.d/www.conf
    sed -i "s|;error_log =.*|error_log = /proc/self/fd/2|g" /data/php/83/php-fpm.conf
    sed -i "s|include=.*|include=/data/php/83/php-fpm.d/*.conf|g" /data/php/83/php-fpm.conf

elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/php/83
fi

if { [ "$PHP82" = "true" ] || [ "$PHP83" = "true" ]; } && [ -n "$PHP_APKS" ]; then
    # From https://github.com/nextcloud/all-in-one/pull/1377/files
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


if [ "$LOGROTATE" = "true" ]; then
    sed -i "s|rotate [0-9]\+|rotate $LOGROTATIONS|g" /etc/logrotate
    touch /data/nginx/access.log \
          /data/nginx/stream.log
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/etc/logrotate.status \
            /data/nginx/access.log \
            /data/nginx/access.log.* \
            /data/nginx/stream.log \
            /data/nginx/stream.log.*
fi

mkdir -p /tmp/acme-challenge \
         /tmp/certbot-work \
         /tmp/certbot-log \
         /tmp/npmhome \
         /tmp/goa

if [ -d /data/nginx/custom ]; then
    mv -vn /data/nginx/custom /data/nginx_custom
fi

mkdir -vp /data/tls/certbot/credentials \
          /data/tls/certbot/renewal \
          /data/tls/custom \
          /data/etc/npm \
          /data/etc/html \
          /data/etc/access \
          /data/etc/crowdsec \
          /data/etc/modsecurity \
          /data/etc/modsecurity/crs-plugins \
          /data/nginx/redirection_host \
          /data/nginx/proxy_host \
          /data/nginx/dead_host \
          /data/nginx/stream \
          /data/nginx_custom

if [ -s /data/database.sqlite ] && [ "$DB_SQLITE_FILE" != "/data/database.sqlite" ]; then
    mv -vn /data/database.sqlite "$DB_SQLITE_FILE"
fi

if [ -s /data/etc/logrotate.status ]; then
    mv -vn /data/etc/logrotate.status /data/etc/logrotate.state
fi

if [ -s /data/keys.json ]; then
    mv -vn /data/keys.json /data/etc/npm/keys.json
fi

if [ -s /data/nginx/default_host/site.conf ]; then
    mv -vn /data/nginx/default_host/site.conf /data/nginx/default.conf
fi

if [ -s /data/nginx/default_www/index.html ]; then
    mv -vn /data/nginx/default_www/index.html /data/etc/html/index.html
fi

if [ -s /data/nginx/dummycert.pem ]; then
    mv -vn /data/nginx/dummycert.pem /data/tls/dummycert.pem
fi

if [ -s /data/nginx/dummykey.pem ]; then
    mv -vn /data/nginx/dummykey.pem /data/tls/dummykey.pem
fi

if [ -f /data/nginx_custom/root.conf ]; then
    mv -vn /data/nginx_custom/root.conf /data/nginx_custom/root_top.conf
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
    cp -van /etc/letsencrypt/* /data/tls/certbot
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

if [ -d /data/tls/certbot/live ] && [ -d /data/tls/certbot/archive ]; then
  find /data/tls/certbot/live ! -name "$(printf "*\n*")" -type f -name "*.pem" > tmp
  while IFS= read -r cert
  do
    rm -vf "$cert"
    ln -s "$(find /data/tls/certbot/archive/"$(echo "$cert" | sed "s|/data/tls/certbot/live/\(npm-[0-9]\+/.*\).pem|\1|g")"*.pem | sort -r | head -n1 | sed "s|/data/tls/certbot/|../../|g")" "$cert"
  done < tmp
  rm tmp
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
            /data/nginx/error.log \
            /data/nginx/ip_ranges.conf
    rm -vf /data/tls/certbot/crs/*.pem
    rm -vf /data/tls/certbot/keys/*.pem

    if [ -d /data/tls/certbot/live ] && [ -d /data/tls/certbot/archive ]; then
      certs_in_use="$(find /data/tls/certbot/live -type l -name "*.pem" -exec readlink -f {} \;)"
      export certs_in_use
      # from: https://www.shellcheck.net/wiki/SC2044
      find /data/tls/certbot/archive ! -name "$(printf "*\n*")" -type f -name "*.pem" > tmp
      while IFS= read -r archive
      do
        if ! echo "$certs_in_use" | grep -q "$archive"; then
          rm -vf "$archive"
        fi
      done < tmp
      rm tmp
    fi
fi

if [ -s "$DB_SQLITE_FILE" ]; then
    sqlite-vaccum.js
fi

if [ "$FULLCLEAN" = "true" ]; then
    if [ "$PHP82" != "true" ] && [ "$PHP83" != "true" ]; then
        rm -vrf /data/php
    fi
fi

touch /tmp/ip_ranges.conf \
      /data/etc/html/index.html \
      /data/nginx_custom/events.conf \
      /data/nginx_custom/http.conf \
      /data/nginx_custom/http_top.conf \
      /data/nginx_custom/root_top.conf \
      /data/nginx_custom/server_dead.conf \
      /data/nginx_custom/server_proxy.conf \
      /data/nginx_custom/server_redirect.conf \
      /data/nginx_custom/stream.conf \
      /data/nginx_custom/stream_top.conf \
      /data/nginx_custom/server_stream.conf \
      /data/nginx_custom/server_stream_tcp.conf \
      /data/nginx_custom/server_stream_udp.conf \
      /data/etc/modsecurity/modsecurity-extra.conf

find /data/nginx -type f -name '*.conf' -exec sed -i "s|nginx/custom|nginx_custom|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s| http2||g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|\(listen .*\) http3|\1 quic|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|quic reuseport;|quic;|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|security_headers on;|include conf.d/include/hsts.conf;|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|more_set_headers \"Alt-Svc: h3=':443'; ma=86400\";|more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';|g" {} \;

find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/access|/data/nginx/access|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/nginx/access|/data/etc/access|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/nginx/html/|/data/etc/html/|g" {} \;

find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/custom_ssl|/data/tls/custom|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|/etc/letsencrypt|/data/tls/certbot|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/letsencrypt|/data/tls/certbot|g" {} \;

find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/ssl|/data/tls|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|ssl_certificate_key /data/nginx/dummykey.pem;|ssl_certificate_key /data/tls/dummykey.pem;|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|ssl_certificate /data/nginx/dummycert.pem;|ssl_certificate /data/tls/dummycert.pem;|g" {} \;

find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/data/ssl|/data/tls|g" {} \;
find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/etc/letsencrypt|/data/tls/certbot|g" {} \;
find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/data/letsencrypt|/data/tls/certbot|g" {} \;

find /data/nginx -type f -name '*.conf' -exec sed -i "/block-exploits.conf/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|/html/404|/html/dead|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/acme-challenge.conf;|include conf.d/include/always.conf;|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/letsencrypt-acme-challenge.conf;|include conf.d/include/always.conf;|g" {} \;

find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/force-ssl.conf;|include conf.d/include/force-tls.conf;|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/ssl-ciphers.conf;|include conf.d/include/tls-ciphers.conf;|g" {} \;

find /data/nginx -type f -name '*.conf' -exec sed -i "/http3/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/Asset Caching/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/assets.conf/d" {} \;

find /data/nginx -type f -name '*.conf' -exec sed -i "/error_log/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/access_log/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/proxy_http_version/d" {} \;

find /data/nginx -type f -name '*.conf' -exec sed -i "/ssl_stapling/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/ssl_stapling_verify/d" {} \;

if [ -s /data/nginx/default.conf ]; then sed -i "/ssl_stapling/d" /data/nginx/default.conf; fi
if [ -s /data/nginx/default.conf ]; then sed -i "/ssl_stapling_verify/d" /data/nginx/default.conf; fi

if [ ! -s /data/etc/modsecurity/modsecurity-default.conf ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example /data/etc/modsecurity/modsecurity-default.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example /data/etc/modsecurity/modsecurity-default.conf.example

if [ -s /data/etc/modsecurity/modsecurity.conf ]; then
      mv -v /data/etc/modsecurity/modsecurity.conf /data/etc/modsecurity/modsecurity-extra.conf
fi

if [ ! -s /data/etc/modsecurity/crs-setup.conf ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example /data/etc/modsecurity/crs-setup.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example /data/etc/modsecurity/crs-setup.conf.example

if [ ! -s /data/etc/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/coreruleset/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example /data/etc/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/coreruleset/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example /data/etc/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example

if [ ! -s /data/etc/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/coreruleset/rules/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example /data/etc/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/coreruleset/rules/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example /data/etc/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example

cp -va /usr/local/nginx/conf/conf.d/include/coreruleset/plugins/* /data/etc/modsecurity/crs-plugins


sed -i "s|48693|$NIBEP|g" /app/index.js
sed -i "s|48693|$NIBEP|g" /usr/local/nginx/conf/conf.d/npm.conf

sed -i "s|48683|$GOAIWSP|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf

sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $IPV4_BINDING:\2/g" /app/templates/_listen.conf
sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $IPV4_BINDING:\2/g" /app/templates/default.conf
sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\({{ incoming_port }}\)/listen $IPV4_BINDING:\2/g" /app/templates/stream.conf
find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $IPV4_BINDING:\2/g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9-]\+\)/listen $IPV4_BINDING:\2/g" {} \;

if [ "$DISABLE_IPV6" = "true" ]; then
    sed -i "s|ipv6=on;|ipv6=off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" /app/templates/_listen.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" /app/templates/default.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\({{ incoming_port }}\)/#listen \[\1\]:\2/g" /app/templates/stream.conf
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" {} \;
    find /data/nginx -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9-]\+\)/#listen \[\1\]:\2/g" {} \;
else
    sed -i "s|ipv6=off;|ipv6=on;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $IPV6_BINDING:\2/g" /app/templates/_listen.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $IPV6_BINDING:\2/g" /app/templates/default.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\({{ incoming_port }}\)/listen $IPV6_BINDING:\2/g" /app/templates/stream.conf
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $IPV6_BINDING:\2/g" {} \;
    find /data/nginx -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9-]\+\)/listen $IPV6_BINDING:\2/g" {} \;
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
    sed -i "s|#\?\(listen.*80\)|#\1|g" /app/templates/_listen.conf
    sed -i "s|#\?\(listen.*80\)|#\1|g" /app/templates/default.conf
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|#\1|g" {} \;
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|#\1|g" {} \;
elif [ "$DISABLE_IPV6" = "true" ]; then
    sed -i "s|#\?\(listen [0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:80\)|\1|g" /app/templates/_listen.conf
    sed -i "s|#\?\(listen [0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:80\)|\1|g" /app/templates/default.conf
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(listen [0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:80\)|\1|g" {} \;
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|#\?\(listen [0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:80\)|\1|g" {} \;
else
    sed -i "s|#\?\(listen.*80\)|\1|g" /app/templates/_listen.conf
    sed -i "s|#\?\(listen.*80\)|\1|g" /app/templates/default.conf
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|\1|g" {} \;
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|\1|g" {} \;
fi

if [ "$DISABLE_H3_QUIC" = "true" ]; then
    sed -i "s|#\?\(listen.*quic\)|#\1|g" /app/templates/_listen.conf
    sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|#\1|g" /app/templates/_listen.conf
    sed -i "s|#\?\(listen.*quic\)|#\1|g" /app/templates/default.conf
    sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|#\1|g" /app/templates/default.conf
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*quic\)|#\1|g" {} \;
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|#\1|g" {} \;
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*quic\)|#\1|g" {} \;
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|#\1|g" {} \;
elif [ "$DISABLE_IPV6" = "true" ]; then
    sed -i "s|#\?\(listen [0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+.*quic\)|\1|g" /app/templates/_listen.conf
    sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|\1|g" /app/templates/_listen.conf
    sed -i "s|#\?\(listen [0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+.*quic\)|\1|g" /app/templates/default.conf
    sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|\1|g" /app/templates/default.conf
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(listen [0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+.*quic\)|\1|g" {} \;
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|\1|g" {} \;
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|#\?\(listen [0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+.*quic\)|\1|g" {} \;
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|\1|g" {} \;
else
    sed -i "s|#\?\(listen.*quic\)|\1|g" /app/templates/_listen.conf
    sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|\1|g" /app/templates/_listen.conf
    sed -i "s|#\?\(listen.*quic\)|\1|g" /app/templates/default.conf
    sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|\1|g" /app/templates/default.conf
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*quic\)|\1|g" {} \;
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|\1|g" {} \;
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*quic\)|\1|g" {} \;
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|#\?\(more_set_headers 'Alt-Svc: h3=\":443\"; ma=86400';\)|\1|g" {} \;
fi

if [ "$NGINX_LOG_NOT_FOUND" = "true" ]; then
    sed -i "s|log_not_found.*|log_not_found on;|g" /usr/local/nginx/conf/nginx.conf
else
    sed -i "s|log_not_found.*|log_not_found off;|g" /usr/local/nginx/conf/nginx.conf
fi

if [ "$NGINX_404_REDIRECT" = "true" ]; then
    sed -i "s|#error_page 404|error_page 404|g" /usr/local/nginx/conf/nginx.conf
else
    sed -i "s|error_page 404|#error_page 404|g" /usr/local/nginx/conf/nginx.conf
fi

if [ "$NGINX_DISABLE_PROXY_BUFFERING" = "true" ]; then
    sed -i "s|proxy_buffering.*|proxy_buffering off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|proxy_request_buffering.*|proxy_request_buffering off;|g" /usr/local/nginx/conf/nginx.conf
else
    sed -i "s|proxy_buffering.*|proxy_buffering on;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|proxy_request_buffering.*|proxy_request_buffering on;|g" /usr/local/nginx/conf/nginx.conf
fi

if [ "$LOGROTATE" = "true" ]; then
    sed -i "s|access_log off; # http|access_log /data/nginx/access.log log;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|access_log off; # stream|access_log /data/nginx/stream.log proxy;|g" /usr/local/nginx/conf/nginx.conf
else
    sed -i "s|access_log /data/nginx/access.log log;|access_log off; # http|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|access_log /data/nginx/stream.log proxy;|access_log off; # stream|g" /usr/local/nginx/conf/nginx.conf
fi

if [ -s /data/tls/certbot/config.ini ]; then
    echo "tls/certbot/config.ini is now unsupported, to remove this warning, just delete the file - some options are replaced by env."
fi

if [ ! -s /data/etc/crowdsec/ban.html ]; then
    cp -van /usr/local/nginx/conf/conf.d/include/ban.html /data/etc/crowdsec/ban.html
fi
cp -a /usr/local/nginx/conf/conf.d/include/ban.html /data/etc/crowdsec/ban.html.example

if [ ! -s /data/etc/crowdsec/captcha.html ]; then
    cp -van /usr/local/nginx/conf/conf.d/include/captcha.html /data/etc/crowdsec/captcha.html
fi
cp -a /usr/local/nginx/conf/conf.d/include/captcha.html /data/etc/crowdsec/captcha.html.example

if [ ! -s /data/etc/crowdsec/crowdsec.conf ]; then
    cp -van /usr/local/nginx/conf/conf.d/include/crowdsec.conf /data/etc/crowdsec/crowdsec.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/crowdsec.conf /data/etc/crowdsec/crowdsec.conf.example
sed -i "s|crowdsec.conf|captcha.html|g" /data/etc/crowdsec/crowdsec.conf

if grep -iq "^ENABLED[ ]*=[ ]*true$" /data/etc/crowdsec/crowdsec.conf; then
    if [ ! -s /usr/local/nginx/conf/conf.d/crowdsec.conf ]; then
        cp -van /usr/local/nginx/conf/conf.d/include/crowdsec_nginx.conf /usr/local/nginx/conf/conf.d/crowdsec.conf
    fi
else
    rm -vf /usr/local/nginx/conf/conf.d/crowdsec.conf
fi


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

                    if [ -s /data/tls/certbot/live/npm-"$DEFAULT_CERT_ID".der ]; then
                         export DEFAULT_STAPLING_FILE=/data/tls/certbot/live/npm-"$DEFAULT_CERT_ID".der
                         echo "DEFAULT_STAPLING_FILE set to /data/tls/certbot/live/npm-$DEFAULT_CERT_ID.der"
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
        rm -vrf /data/tls/dummycert.pem /data/tls/dummykey.pem
        openssl req -new -newkey rsa:4096 -days 365000 -nodes -x509 -subj '/CN=*' -sha256 -keyout /data/tls/dummykey.pem -out /data/tls/dummycert.pem
    fi
else
    rm -vrf /data/tls/dummycert.pem /data/tls/dummykey.pem
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /app/templates/default.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /app/templates/default.conf
if [ -n "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|tls-ciphers-no-stapling.conf;|tls-ciphers.conf;|g" /app/templates/default.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /app/templates/default.conf
else
    sed -i "s|tls-ciphers.conf;|tls-ciphers-no-stapling.conf;|g" /app/templates/default.conf
    sed -i "s|#\?ssl_stapling_file .*|#ssl_stapling_file ;|g" /app/templates/default.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/include/default.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/include/default.conf
if [ -n "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|tls-ciphers-no-stapling.conf;|tls-ciphers.conf;|g" /usr/local/nginx/conf/conf.d/include/default.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/include/default.conf
else
    sed -i "s|tls-ciphers.conf;|tls-ciphers-no-stapling.conf;|g" /usr/local/nginx/conf/conf.d/include/default.conf
    sed -i "s|#\?ssl_stapling_file .*|#ssl_stapling_file ;|g" /usr/local/nginx/conf/conf.d/include/default.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
if [ -n "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|tls-ciphers-no-stapling.conf;|tls-ciphers.conf;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
else
    sed -i "s|tls-ciphers.conf;|tls-ciphers-no-stapling.conf;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
    sed -i "s|#\?ssl_stapling_file .*|#ssl_stapling_file ;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/npm.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/npm.conf
if [ -n "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|tls-ciphers-no-stapling.conf;|tls-ciphers.conf;|g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/npm.conf
else
    sed -i "s|tls-ciphers.conf;|tls-ciphers-no-stapling.conf;|g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s|#\?ssl_stapling_file .*|#ssl_stapling_file ;|g" /usr/local/nginx/conf/conf.d/npm.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
if [ -n "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|tls-ciphers-no-stapling.conf;|tls-ciphers.conf;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
else
    sed -i "s|tls-ciphers.conf;|tls-ciphers-no-stapling.conf;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
    sed -i "s|#\?ssl_stapling_file .*|#ssl_stapling_file ;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
if [ -n "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|tls-ciphers-no-stapling.conf;|tls-ciphers.conf;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
else
    sed -i "s|tls-ciphers.conf;|tls-ciphers-no-stapling.conf;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
    sed -i "s|#\?ssl_stapling_file .*|#ssl_stapling_file ;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf
if [ -n "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|tls-ciphers-no-stapling.conf;|tls-ciphers.conf;|g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf
else
    sed -i "s|tls-ciphers.conf;|tls-ciphers-no-stapling.conf;|g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf
    sed -i "s|#\?ssl_stapling_file .*|#ssl_stapling_file ;|g" /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /data/nginx/default.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /data/nginx/default.conf
if [ -n "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|tls-ciphers-no-stapling.conf;|tls-ciphers.conf;|g" /data/nginx/default.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /data/nginx/default.conf
else
    sed -i "s|tls-ciphers.conf;|tls-ciphers-no-stapling.conf;|g" /data/nginx/default.conf
    sed -i "s|#\?ssl_stapling_file .*|#ssl_stapling_file ;|g" /data/nginx/default.conf
fi

if [ ! -s /data/nginx/default.conf ]; then
    cp -van /usr/local/nginx/conf/conf.d/include/default.conf /data/nginx/default.conf
fi
sed -i "s|quic default_server|quic reuseport default_server|g" /data/nginx/default.conf

if [ "$GOA" = "true" ]; then
    mkdir -vp /data/etc/goaccess/data /data/etc/goaccess/geoip
    cp -va /usr/local/nginx/conf/conf.d/include/goaccess.conf /usr/local/nginx/conf/conf.d/goaccess.conf
    cp -va /usr/local/nginx/conf/conf.d/include/goaccess-no-server-name.conf /usr/local/nginx/conf/conf.d/goaccess-no-server-name.conf
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/etc/goaccess
fi

if [ "$DISABLE_NGINX_BEAUTIFIER" = "false" ]; then
    nginxbeautifier -s 4 -r /data/nginx
fi

rm -vf /usr/local/nginx/logs/nginx.pid
rm -vf /run/*.sock

find /data/tls \
     /data/etc/npm \
     /data/etc/access \
     -not -perm 770 \
     -exec chmod 770 {} \;

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
    find /proc/self/fd \
         /usr/local \
         /data \
         /run \
         /tmp \
         -not \( -uid "$PUID" -and -gid "$PGID" \) \
         -exec chown "$PUID:$PGID" {} \;
    if [ "$PHP82" = "true" ]; then
        sed -i "s|user =.*|;user = root|" /data/php/82/php-fpm.d/www.conf
        sed -i "s|group =.*|;group = root|" /data/php/82/php-fpm.d/www.conf
    fi
    if [ "$PHP83" = "true" ]; then
        sed -i "s|user =.*|;user = root|" /data/php/83/php-fpm.d/www.conf
        sed -i "s|group =.*|;group = root|" /data/php/83/php-fpm.d/www.conf
    fi
    sed -i "s|#\?user root;|#user root;|g" /usr/local/nginx/conf/nginx.conf
    exec su-exec "$PUID:$PGID" launch.sh
else
    find /proc/self/fd \
         /usr/local \
         /data \
         /run \
         /tmp \
         -not \( -uid 0 -and -gid 0 \) \
         -exec chown 0:0 {} \;
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
