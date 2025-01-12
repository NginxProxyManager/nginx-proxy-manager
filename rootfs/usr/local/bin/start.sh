#!/usr/bin/env sh

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
-------------------------------------
"

if [ "$(whoami)" != "root" ] || [ "$(id -u)" != "0" ] || [ "$(id -g)" != "0" ]; then
	echo "-----------------------------------------------------------------"
	echo "This docker container must be run as root, do not specify a user."
	echo "-----------------------------------------------------------------"
    sleep inf
fi

if [ ! -d /data ]; then
	echo "----------------------------------------------"
	echo "/data is not mounted! Check your compose.yaml."
	echo "----------------------------------------------"
    sleep inf
fi


touch /data/.env
. /data/.env

if [ -s /tmp/env.sha512sum ] && [ "$(cat /tmp/env.sha512sum)" != "$(sha512sum < /data/.env)" ]; then
    echo "You need to recreate the NPMplus container after changing the .env file, restarting the container after changing the .env file is not supported"
    sleep inf
fi

sha512sum < /data/.env > /tmp/env.sha512sum


if [ -n "$NC_AIO" ] && ! echo "$NC_AIO" | grep -q "^true$\|^false$"; then
    echo "NC_AIO needs to be true or false."
    sleep inf
fi
if [ "$NC_AIO" = "true" ]; then
    if [ -z "$NC_DOMAIN" ]; then
        echo "NC_DOMAIN is required in AIO mode."
        sleep inf
    fi
    export DISABLE_HTTP="${DISABLE_HTTP:-true}"
fi

export ACME_SERVER="${ACME_SERVER:-https://acme-v02.api.letsencrypt.org/directory}"
export ACME_MUST_STAPLE="${ACME_MUST_STAPLE:-false}"
export ACME_OCSP_STAPLING="${ACME_OCSP_STAPLING:-true}"
export ACME_KEY_TYPE="${ACME_KEY_TYPE:-ecdsa}"
export ACME_SERVER_TLS_VERIFY="${ACME_SERVER_TLS_VERIFY:-true}"
export CUSTOM_OCSP_STAPLING="${CUSTOM_OCSP_STAPLING:-false}"
export PUID="${PUID:-0}"
export PGID="${PGID:-0}"
export NIBEP="${NIBEP:-48681}"
export GOAIWSP="${GOAIWSP:-48691}"
export NPM_PORT="${NPM_PORT:-81}"
export GOA_PORT="${GOA_PORT:-91}"
export IPV4_BINDING="${IPV4_BINDING:-0.0.0.0}"
export NPM_IPV4_BINDING="${NPM_IPV4_BINDING:-0.0.0.0}"
export GOA_IPV4_BINDING="${GOA_IPV4_BINDING:-0.0.0.0}"
export IPV6_BINDING="${IPV6_BINDING:-[::]}"
export NPM_IPV6_BINDING="${NPM_IPV6_BINDING:-[::]}"
export GOA_IPV6_BINDING="${GOA_IPV6_BINDING:-[::]}"
export DISABLE_IPV6="${DISABLE_IPV6:-false}"
export NPM_LISTEN_LOCALHOST="${NPM_LISTEN_LOCALHOST:-false}"
export GOA_LISTEN_LOCALHOST="${GOA_LISTEN_LOCALHOST:-false}"
export DEFAULT_CERT_ID="${DEFAULT_CERT_ID:-0}"
export HTTP_PORT="${HTTP_PORT:-80}"
export HTTPS_PORT="${HTTPS_PORT:-443}"
export DISABLE_HTTP="${DISABLE_HTTP:-false}"
export DISABLE_H3_QUIC="${DISABLE_H3_QUIC:-false}"
export NGINX_QUIC_BPF="${NGINX_QUIC_BPF:-false}"
export NGINX_ACCESS_LOG="${NGINX_ACCESS_LOG:-false}"
export NGINX_LOG_NOT_FOUND="${NGINX_LOG_NOT_FOUND:-false}"
export NGINX_404_REDIRECT="${NGINX_404_REDIRECT:-false}"
export NGINX_HSTS_SUBDMAINS="${NGINX_HSTS_SUBDMAINS:-true}"
export X_FRAME_OPTIONS="${X_FRAME_OPTIONS:-deny}"
export NGINX_DISABLE_PROXY_BUFFERING="${NGINX_DISABLE_PROXY_BUFFERING:-false}"
export NGINX_WORKER_PROCESSES="${NGINX_WORKER_PROCESSES:-auto}"
export NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE="${NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE:-false}"
export DISABLE_NGINX_BEAUTIFIER="${DISABLE_NGINX_BEAUTIFIER:-false}"
export FULLCLEAN="${FULLCLEAN:-false}"
export SKIP_IP_RANGES="${SKIP_IP_RANGES:-false}"
export LOGROTATE="${LOGROTATE:-false}"
export LOGROTATIONS="${LOGROTATIONS:-3}"
export CRT="${CRT:-24}"
export IPRT="${IPRT:-1}"
export GOA="${GOA:-false}"
export GOACLA="${GOACLA:-"--agent-list --real-os --double-decode --anonymize-ip --anonymize-level=1 --keep-last=30 --with-output-resolver --no-query-string"}"
export PHP82="${PHP82:-false}"
export PHP83="${PHP83:-false}"
export PHP84="${PHP84:-false}"


#tmp
if [ -n "$NPM_DISABLE_IPV6" ]; then
    echo "NPM_DISABLE_IPV6 env is not supported. DISABLE_IPV6 will also disable IPv6 for the NPMplus web UI."
    sleep inf
fi

#tmp
if [ -n "$GOA_DISABLE_IPV6" ]; then
    echo "GOA_DISABLE_IPV6 env is not supported. DISABLE_IPV6 will also disable IPv6 for goaccess."
    sleep inf
fi

if [ -n "$LE_SERVER" ]; then
    echo "LE_SERVER env is replaced by ACME_SERVER, please change it to ACME_SERVER"
    sleep inf
fi

if [ -n "$LE_STAGING" ]; then
    echo "LE_STAGING env is not supported, please use ACME_SERVER."
    sleep inf
fi

if [ -n "$DEBUG" ]; then
    echo "DEBUG env is not supported."
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

if ! echo "$ACME_OCSP_STAPLING" | grep -q "^true$\|^false$"; then
    echo "ACME_OCSP_STAPLING needs to be true or false."
    sleep inf
fi

if ! echo "$ACME_KEY_TYPE" | grep -q "^ecdsa$\|^rsa$"; then
    echo "ACME_KEY_TYPE needs to be ecdsa or rsa."
    sleep inf
fi

if ! echo "$ACME_SERVER_TLS_VERIFY" | grep -q "^true$\|^false$"; then
    echo "ACME_SERVER_TLS_VERIFY needs to be true or false."
    sleep inf
fi


if ! echo "$PUID" | grep -q "^[0-9]\+$"; then
    echo "PUID needs to be a number greater or equal to 99, or equal to 0."
    sleep inf
fi

if [ "$PUID" -lt "99" ] && [ "$PUID" != "0" ]; then
    echo "PUID needs to be a number greater or equal to 99, or equal to 0."
    sleep inf
fi

if ! echo "$PGID" | grep -q "^[0-9]\+$"; then
    echo "PGID needs to be a number greater or equal to 99, or equal to 0."
    sleep inf
fi

if [ "$PGID" -lt "99" ] && [ "$PGID" != "0" ]; then
    echo "PGID needs to be a number greater or equal to 99, or equal to 0."
    sleep inf
fi

if [ "$PGID" != "0" ] && [ "$PUID" = "0" ]; then
    echo "You've set PGID but not PUID. Which is required."
    sleep inf
fi

if [ "$PGID" = "0" ] && [ "$PUID" != "0" ]; then
    echo "You've set PUID but not PGID. Are you sure that this is what you wanted?"
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


if ! echo "$HTTP_PORT" | grep -q "^[0-9]\+$"; then
    echo "HTTP_PORT needs to be a number."
    sleep inf
fi

if ! echo "$HTTPS_PORT" | grep -q "^[0-9]\+$"; then
    echo "HTTPS_PORT needs to be a number."
    sleep inf
fi

if [ "$HTTP_PORT" = "$HTTPS_PORT" ] && [ "$DISABLE_HTTP" = "false" ]; then
    echo "HTTP_PORT and HTTPS_PORT need to be different."
    sleep inf
fi


if ! echo "$IPV4_BINDING" | grep -q "^[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}$"; then
    echo "IPV4_BINDING needs to be a IPv4-Address: four blocks of numbers separated by dots."
    sleep inf
fi

if ! echo "$NPM_IPV4_BINDING" | grep -q "^[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}$"; then
    echo "NPM_IPV4_BINDING needs to be a IPv4-Address: four blocks of numbers separated by dots."
    sleep inf
fi

if ! echo "$GOA_IPV4_BINDING" | grep -q "^[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}$"; then
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

if ! echo "$NGINX_QUIC_BPF" | grep -q "^true$\|^false$"; then
    echo "NGINX_QUIC_BPF needs to be true or false."
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

if ! echo "$NGINX_HSTS_SUBDMAINS" | grep -q "^true$\|^false$"; then
    echo "NGINX_HSTS_SUBDMAINS needs to be true or false."
    sleep inf
fi

if ! echo "$X_FRAME_OPTIONS" | grep -q "^none$\|^sameorigin$\|^deny$"; then
    echo "X_FRAME_OPTIONS needs to be none, sameorigin or deny."
    sleep inf
fi

if ! echo "$NGINX_DISABLE_PROXY_BUFFERING" | grep -q "^true$\|^false$"; then
    echo "NGINX_DISABLE_PROXY_BUFFERING needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_WORKER_PROCESSES" | grep -q "^auto$\|^[0-9]\+$"; then
    echo "NGINX_WORKER_PROCESSES needs to be auto or a number."
    sleep inf
fi

if ! echo "$DISABLE_NGINX_BEAUTIFIER" | grep -q "^true$\|^false$"; then
    echo "DISABLE_NGINX_BEAUTIFIER needs to be true or false."
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
    if [ -s /data/etc/goaccess/geoip/GeoLite2-City.mmdb ] || [ -s /data/etc/goaccess/geoip/GeoLite2-Country.mmdb ]|| [ -s /data/etc/goaccess/geoip/GeoLite2-ASN.mmdb ]; then
        echo "All goaccess geoip databases need to be moved from etc/goaccess/geoip to goaccess/geoip inside the mounted data folder!"
    fi
    if [ -s /data/goaccess/geoip/GeoLite2-City.mmdb ]; then
        export GOACLA="$GOACLA --geoip-database=/data/goaccess/geoip/GeoLite2-City.mmdb"
    fi
    if [ -s /data/goaccess/geoip/GeoLite2-Country.mmdb ]; then
        export GOACLA="$GOACLA --geoip-database=/data/goaccess/geoip/GeoLite2-Country.mmdb"
    fi
    if [ -s /data/goaccess/geoip/GeoLite2-ASN.mmdb ]; then
        export GOACLA="$GOACLA --geoip-database=/data/goaccess/geoip/GeoLite2-ASN.mmdb"
    fi
fi

if [ -n "$GOACLA" ] && ! echo "$GOACLA" | grep -q "^-[a-zA-Z0-9 =/_.-]\+$"; then
    echo "GOACLA must start with a hyphen and can consist of lower and upper letters a-z A-Z, numbers 0-9, spaces, equals signs, slashes, underscores, dots and hyphens."
    sleep inf
fi


if [ -n "$PHP_APKS" ] && [ "$PHP82" = "false" ] && [ "$PHP83" = "false" ] && [ "$PHP84" = "false" ]; then
    echo "PHP_APKS is set, but PHP82, PHP83 and PHP84 is disabled."
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


if ! echo "$PHP84" | grep -q "^true$\|^false$"; then
    echo "PHP84 needs to be true or false."
    sleep inf
fi

if [ -n "$PHP84_APKS" ] && [ "$PHP84" = "false" ]; then
    echo "PHP84_APKS is set, but PHP84 is disabled."
    sleep inf
fi

if [ -n "$PHP84_APKS" ] && ! echo "$PHP84_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
    echo "PHP84_APKS can consist of lower letters a-z, numbers 0-9, spaces, underscores and hyphens."
    sleep inf
fi


if [ -n "$INITIAL_ADMIN_EMAIL" ] && ! echo "$INITIAL_ADMIN_EMAIL" | grep -q "@.*\."; then
    echo "INITIAL_ADMIN_EMAIL needs to contains a @ and one dot."
    sleep inf
fi

if [ -n "$INITIAL_DEFAULT_PAGE" ] && ! echo "$INITIAL_DEFAULT_PAGE" | grep -q "^\(404\|444\|redirect\|congratulations\|html\)$"; then
    echo "INITIAL_DEFAULT_PAGE needs to be 404, 444, redirect, congratulations or html."
    sleep inf
fi


export TV="2"
if [ ! -s /data/npmplus/env.sha512sum ] || [ "$(cat /data/npmplus/env.sha512sum)" != "$( (grep "env\.[A-Z0-9_]\+" -roh /app/templates | sed "s|env.||g" | sort | uniq | xargs printenv; echo "$TV") | tr -d "\n" | sha512sum | cut -d" " -f1)" ]; then
    echo "At least one env or the template version changed, all hosts will be regenerated."
    export REGENERATE_ALL="true"
fi


if [ "$ACME_MUST_STAPLE" = "false" ]; then
    sed -i "s|must-staple = true|must-staple = false|g" /etc/certbot.ini
fi
if [ "$ACME_KEY_TYPE" = "rsa" ]; then
    sed -i "s|key-type = ecdsa|key-type = rsa|g" /etc/certbot.ini
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
    sed -i "s|#\?listen =.*|listen = /run/php82.sock|" /data/php/82/php-fpm.d/www.conf
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
    sed -i "s|#\?listen =.*|listen = /run/php83.sock|" /data/php/83/php-fpm.d/www.conf
    sed -i "s|;error_log =.*|error_log = /proc/self/fd/2|g" /data/php/83/php-fpm.conf
    sed -i "s|include=.*|include=/data/php/83/php-fpm.d/*.conf|g" /data/php/83/php-fpm.conf
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/php/83
fi

if [ "$PHP84" = "true" ]; then
    apk add --no-cache php84-fpm
    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP84_APKS" ]; then
        for apk in $(echo "$PHP84_APKS" | tr " " "\n"); do
            if ! echo "$apk" | grep -q "^php84-.*$"; then
                echo "$apk is a non allowed value."
                echo "It needs to start with \"php84-\"."
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
    cp -varnT /etc/php84 /data/php/84
    sed -i "s|#\?listen =.*|listen = /run/php84.sock|" /data/php/84/php-fpm.d/www.conf
    sed -i "s|;error_log =.*|error_log = /proc/self/fd/2|g" /data/php/84/php-fpm.conf
    sed -i "s|include=.*|include=/data/php/84/php-fpm.d/*.conf|g" /data/php/84/php-fpm.conf
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/php/84
fi

if { [ "$PHP82" = "true" ] || [ "$PHP83" = "true" ] || [ "$PHP84" = "true" ]; } && [ -n "$PHP_APKS" ]; then
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

if [ "$FULLCLEAN" = "true" ] && [ "$PHP82" = "false" ] && [ "$PHP83" = "false" ] && [ "$PHP84" = "false" ]; then
    rm -vrf /data/php
fi


mkdir -p /tmp/acme-challenge \
         /tmp/npmhome \
         /tmp/goa \
         /tmp/certbot-log \
         /tmp/certbot-work \
         /tmp/certbot-credentials
mkdir -vp /data/tls/certbot/renewal \
          /data/tls/custom \
          /data/npmplus \
          /data/html \
          /data/access \
          /data/crowdsec \
          /data/modsecurity \
          /data/modsecurity/crs-plugins \
          /data/nginx/redirection_host \
          /data/nginx/proxy_host \
          /data/nginx/dead_host \
          /data/nginx/stream \
          /data/custom_nginx


if [ -n "$(ls -A /data/nginx/custom 2> /dev/null)"  ]; then
    cp -van /data/nginx/custom/* /data/nginx_custom
fi
rm -vrf /data/nginx/custom

#tmp
if [ -n "$(ls -A /data/nginx_custom 2> /dev/null)"  ]; then
    cp -van /data/nginx_custom/* /data/custom_nginx
fi
rm -vrf /data/nginx_custom

#tmp
if [ -n "$(ls -A /data/etc 2> /dev/null)" ]; then
    cp -van /data/etc/* /data
    if [ -s /data/crowdsec/crowdsec.conf ]; then
        sed -i "s|/data/etc|/data|g" /data/crowdsec/crowdsec.conf
    fi
fi
rm -vrf /data/etc

#tmp
if [ -n "$(ls -A /data/npm 2> /dev/null)" ]; then
    cp -van /data/npm/* /data/npmplus
fi
rm -vrf /data/npm


if [ -s /data/database.sqlite ]; then
    mv -vn /data/database.sqlite /data/npmplus/database.sqlite
fi

if [ -s "$DB_SQLITE_FILE" ] && [ "$DB_SQLITE_FILE" != "/data/npmplus/database.sqlite" ]; then
    mv -vn "$DB_SQLITE_FILE" /data/npmplus/database.sqlite
    echo "DB_SQLITE_FILE is not supported."
fi

if [ -s /data/npmplus/database.sqlite ]; then
    sqlite-vaccum.js
fi


if [ -s /data/keys.json ]; then
    mv -vn /data/keys.json /data/npmplus/keys.json
fi


if [ -n "$(ls -A /data/nginx/default_www 2> /dev/null)" ]; then
    cp -van /data/nginx/default_www/* /data/html
fi
rm -vrf /data/nginx/default_www

if [ -n "$(ls -A /data/custom_ssl 2> /dev/null)" ]; then
    cp -van /data/custom_ssl/* /data/tls/custom
fi
rm -vrf /data/custom_ssl


if [ -n "$(ls -A /etc/letsencrypt 2> /dev/null)" ]; then
    cp -van /etc/letsencrypt/* /data/tls/certbot
    rm -vrf /etc/letsencrypt/*
    find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/etc/letsencrypt|/data/tls/certbot|g" {} \;
fi

find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/data/tls/certbot/credentials|/tmp/certbot-credentials|g" {} \;

if [ -d /data/tls/certbot/live ] && [ -d /data/tls/certbot/archive ]; then
  find /data/tls/certbot/live ! -name "$(printf "*\n*")" -type f -name "*.pem" > tmp
  while IFS= read -r cert
  do
    rm -vf "$cert"
    ln -s "$(find /data/tls/certbot/archive/"$(echo "$cert" | sed "s|/data/tls/certbot/live/\(npm-[0-9]\+/.*\).pem|\1|g")"*.pem | sort -r | head -n1 | sed "s|/data/tls/certbot/|../../|g")" "$cert"
  done < tmp
  rm tmp
fi

rm -vrf /data/tls/certbot/crs
rm -vrf /data/tls/certbot/keys
if [ -d /data/tls/certbot/live ] && [ -d /data/tls/certbot/archive ]; then
    certs_in_use="$(find /data/tls/certbot/live -type l -name "*.pem" -exec readlink -f {} \;)"
    export certs_in_use
    find /data/tls/certbot/archive ! -name "$(printf "*\n*")" -type f -name "*.pem" > tmp
    while IFS= read -r archive
    do
        if ! echo "$certs_in_use" | grep -q "$archive"; then
          rm -vf "$archive"
        fi
    done < tmp
    rm tmp
fi

rm -vrf /data/letsencrypt-acme-challenge \
        /data/nginx/default_host \
        /data/nginx/temp \
        /data/logs

touch /data/modsecurity/modsecurity-extra.conf \
      /data/html/index.html \
      /tmp/ip_ranges.conf \
      /data/custom_nginx/events.conf \
      /data/custom_nginx/http.conf \
      /data/custom_nginx/http_top.conf \
      /data/custom_nginx/root_top.conf \
      /data/custom_nginx/root.conf \
      /data/custom_nginx/server_dead.conf \
      /data/custom_nginx/server_proxy.conf \
      /data/custom_nginx/server_redirect.conf \
      /data/custom_nginx/stream.conf \
      /data/custom_nginx/stream_top.conf \
      /data/custom_nginx/server_stream.conf \
      /data/custom_nginx/server_stream_tcp.conf \
      /data/custom_nginx/server_stream_udp.conf


if [ ! -s /data/modsecurity/modsecurity-default.conf ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example /data/modsecurity/modsecurity-default.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/modsecurity.conf.example /data/modsecurity/modsecurity-default.conf.example

if [ ! -s /data/modsecurity/crs-setup.conf ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example /data/modsecurity/crs-setup.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example /data/modsecurity/crs-setup.conf.example

if [ ! -s /data/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/coreruleset/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example /data/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/coreruleset/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example /data/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example

if [ ! -s /data/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example ]; then
      cp -van /usr/local/nginx/conf/conf.d/include/coreruleset/rules/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example /data/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/coreruleset/rules/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example /data/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf.example

cp -a /usr/local/nginx/conf/conf.d/include/coreruleset/plugins/* /data/modsecurity/crs-plugins


if [ ! -s /data/crowdsec/ban.html ]; then
    cp -van /usr/local/nginx/conf/conf.d/include/ban.html /data/crowdsec/ban.html
fi
cp -a /usr/local/nginx/conf/conf.d/include/ban.html /data/crowdsec/ban.html.example

if [ ! -s /data/crowdsec/captcha.html ]; then
    cp -van /usr/local/nginx/conf/conf.d/include/captcha.html /data/crowdsec/captcha.html
fi
cp -a /usr/local/nginx/conf/conf.d/include/captcha.html /data/crowdsec/captcha.html.example

if [ ! -s /data/crowdsec/crowdsec.conf ]; then
    cp -van /usr/local/nginx/conf/conf.d/include/crowdsec.conf /data/crowdsec/crowdsec.conf
fi
cp -a /usr/local/nginx/conf/conf.d/include/crowdsec.conf /data/crowdsec/crowdsec.conf.example

if grep -iq "^ENABLED[ ]*=[ ]*true$" /data/crowdsec/crowdsec.conf; then
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
                if [ -s /data/tls/certbot/live/npm-"$DEFAULT_CERT_ID".der ] && [ "$ACME_OCSP_STAPLING" = "true" ]; then
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
                if [ -s /data/tls/custom/npm-"$DEFAULT_CERT_ID".der ] && [ "$CUSTOM_OCSP_STAPLING" = "true" ]; then
                     export DEFAULT_STAPLING_FILE=/data/tls/custom/npm-"$DEFAULT_CERT_ID".der
                     echo "DEFAULT_STAPLING_FILE set to /data/tls/custom/npm-$DEFAULT_CERT_ID.der"
                fi
            fi
        fi
    else
        export DEFAULT_CERT=/data/tls/dummycert.pem
        export DEFAULT_KEY=/data/tls/dummykey.pem
        echo "cert with ID $DEFAULT_CERT_ID does not exist, using dummycerts."
    fi
fi

if { [ "$DEFAULT_CERT" = "/data/tls/dummycert.pem" ] && [ "$DEFAULT_KEY" != "/data/tls/dummykey.pem" ]; } || { [ "$DEFAULT_CERT" != "/data/tls/dummycert.pem" ] && [ "$DEFAULT_KEY" = "/data/tls/dummykey.pem" ]; }; then
    export DEFAULT_CERT=/data/tls/dummycert.pem
    export DEFAULT_KEY=/data/tls/dummykey.pem
    echo "something went wrong, using dummycerts."
fi

if [ "$DEFAULT_CERT" = "/data/tls/dummycert.pem" ] || [ "$DEFAULT_KEY" = "/data/tls/dummykey.pem" ]; then
    if [ ! -s /data/tls/dummycert.pem ] || [ ! -s /data/tls/dummykey.pem ]; then
        rm -vrf /data/tls/dummycert.pem /data/tls/dummykey.pem
        openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:secp384r1 -days 365000 -nodes -x509 -subj '/CN=*' -sha512 -keyout /data/tls/dummykey.pem -out /data/tls/dummycert.pem
    fi
    unset DEFAULT_STAPLING_FILE
else
    rm -vrf /data/tls/dummycert.pem /data/tls/dummykey.pem
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /app/templates/default.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /app/templates/default.conf
if [ -s "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|#\?ssl_stapling|ssl_stapling|g" /app/templates/default.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /app/templates/default.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/npm.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/npm.conf
if [ -s "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|#\?ssl_stapling|ssl_stapling|g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/npm.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
if [ -s "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|#\?ssl_stapling|ssl_stapling|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
fi

sed -i "s|48681|$NIBEP|g" /usr/local/nginx/conf/conf.d/npm.conf
sed -i "s|48691|$GOAIWSP|g" /usr/local/nginx/conf/conf.d/include/goaccess.conf

sed -i "s|#\?listen 0.0.0.0:81 |listen $NPM_IPV4_BINDING:$NPM_PORT |g" /usr/local/nginx/conf/conf.d/npm.conf
sed -i "s|#\?listen 0.0.0.0:91 |listen $GOA_IPV4_BINDING:$GOA_PORT |g" /usr/local/nginx/conf/conf.d/include/goaccess.conf

if [ "$DISABLE_IPV6" = "true" ]; then
    sed -i "s|ipv6=on;|ipv6=off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|#\?listen \[::\]:81 |#listen $NPM_IPV6_BINDING:$NPM_PORT |g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s|#\?listen \[::\]:91 |#listen $GOA_IPV6_BINDING:$GOA_PORT |g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
else
    sed -i "s|#\?listen \[::\]:81 |listen $NPM_IPV6_BINDING:$NPM_PORT |g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s|#\?listen \[::\]:91 |listen $GOA_IPV6_BINDING:$GOA_PORT |g" /usr/local/nginx/conf/conf.d/include/goaccess.conf
fi

if [ "$GOA" = "true" ]; then
    mkdir -vp /data/goaccess/data /data/goaccess/geoip
    cp -van /usr/local/nginx/conf/conf.d/include/goaccess.conf /usr/local/nginx/conf/conf.d/goaccess.conf
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/goaccess
fi

if [ "$NGINX_QUIC_BPF" = "true" ]; then
  sed -i "s|quic_bpf.*|quic_bpf on;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOG_NOT_FOUND" = "true" ]; then
    sed -i "s|log_not_found.*|log_not_found on;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_404_REDIRECT" = "true" ]; then
    sed -i "s|#error_page 404|error_page 404|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_DISABLE_PROXY_BUFFERING" = "true" ]; then
    sed -i "s|proxy_buffering.*|proxy_buffering off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|proxy_request_buffering.*|proxy_request_buffering off;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_WORKER_PROCESSES" != "auto" ]; then
    sed -i "s|worker_processes.*|worker_processes $NGINX_WORKER_PROCESSES;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE" = "true" ]; then
    sed -i "s|#load_module /usr/local/lib/libngx_module.so;|load_module /usr/local/lib/libngx_module.so;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_HSTS_SUBDMAINS" = "false" ]; then
    sed -i "s|includeSubDomains; ||g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$X_FRAME_OPTIONS" = "sameorigin" ]; then
    sed -i "s|DENY|SAMEORIGIN|g" /usr/local/nginx/conf/conf.d/include/hsts.conf
fi
if [ "$X_FRAME_OPTIONS" = "none" ]; then
    sed -i "s|#\?\(.*DENY\)|#\1|g" /usr/local/nginx/conf/conf.d/include/hsts.conf
fi

if [ "$REGENERATE_ALL" = "true" ]; then
    find /data/nginx -name "*.conf" -delete
fi

if [ "$LOGROTATE" = "true" ]; then
    sed -i "s|rotate [0-9]\+|rotate $LOGROTATIONS|g" /etc/logrotate
    sed -i "s|access_log off; # http|access_log /data/nginx/access.log log;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|access_log off; # stream|access_log /data/nginx/stream.log proxy;|g" /usr/local/nginx/conf/nginx.conf
    touch /data/nginx/access.log \
          /data/nginx/stream.log
elif [ "$FULLCLEAN" = "true" ]; then
    rm -vrf /data/logrotate.status \
            /data/nginx/access.log \
            /data/nginx/access.log.* \
            /data/nginx/stream.log \
            /data/nginx/stream.log.*
fi

find /data/tls \
     /data/access \
     /data/npmplus \
     -not -perm 770 \
     -exec chmod 770 {} \;

rm -vf /usr/local/nginx/logs/nginx.pid
rm -vf /run/*.sock

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
        sed -i "s|;\?user =.*|;user = root|" /data/php/82/php-fpm.d/www.conf
        sed -i "s|;\?group =.*|;group = root|" /data/php/82/php-fpm.d/www.conf
    fi
    if [ "$PHP83" = "true" ]; then
        sed -i "s|;\?user =.*|;user = root|" /data/php/83/php-fpm.d/www.conf
        sed -i "s|;\?group =.*|;group = root|" /data/php/83/php-fpm.d/www.conf
    fi
    if [ "$PHP84" = "true" ]; then
        sed -i "s|;\?user =.*|;user = root|" /data/php/84/php-fpm.d/www.conf
        sed -i "s|;\?group =.*|;group = root|" /data/php/84/php-fpm.d/www.conf
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
    if [ "$PHP84" = "true" ]; then
        sed -i "s|;user =.*|user = root|" /data/php/84/php-fpm.d/www.conf
        sed -i "s|;group =.*|group = root|" /data/php/84/php-fpm.d/www.conf
    fi
    sed -i "s|#user root;|user root;|g"  /usr/local/nginx/conf/nginx.conf
    exec launch.sh
fi
