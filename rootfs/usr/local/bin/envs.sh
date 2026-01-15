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
	echo "-----------------------------------------------------------------------------------------------"
	echo "This docker container must be run as root, do not specify a user. Please use PUID/PGID instead."
	echo "-----------------------------------------------------------------------------------------------"
    sleep inf
fi

if [ ! -d /data ]; then
	echo "----------------------------------------------"
	echo "/data is not mounted! Check your compose.yaml."
	echo "----------------------------------------------"
    sleep inf
fi


touch /data/.env
# shellcheck source=/dev/null
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
    if [ -z "$NC_DOMAIN" ] || ! echo "$NC_DOMAIN" | grep -q "\."; then
        echo "NC_DOMAIN is unset (but required in AIO mode) or invalid, it needs to contain a dot."
        sleep inf
    fi
    export DISABLE_HTTP="${DISABLE_HTTP:-true}"
    export INITIAL_ADMIN_EMAIL="${INITIAL_ADMIN_EMAIL:-admin@example.org}"
    export INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-$(openssl rand -hex 32)}"
fi


export ACME_SERVER="${ACME_SERVER:-https://acme-v02.api.letsencrypt.org/directory}"

case "$ACME_SERVER" in
    "https://acme-v02.api.letsencrypt.org/directory")
        export ACME_PROFILE="${ACME_PROFILE:-shortlived}"
        ;;

    "https://dv.acme-v02.api.pki.goog/directory")
        export ACME_OCSP_STAPLING="${ACME_OCSP_STAPLING:-true}"
        export ACME_MUST_STAPLE="${ACME_MUST_STAPLE:-true}"
        ;;

    "https://acme.zerossl.com/v2/DV90")
        export ACME_OCSP_STAPLING="${ACME_OCSP_STAPLING:-true}"
        export ACME_MUST_STAPLE="${ACME_MUST_STAPLE:-true}"
        ;;
esac

export ACME_MUST_STAPLE="${ACME_MUST_STAPLE:-false}"
export ACME_OCSP_STAPLING="${ACME_OCSP_STAPLING:-false}"
export ACME_PROFILE="${ACME_PROFILE:-none}"

export ACME_KEY_TYPE="${ACME_KEY_TYPE:-ecdsa}"
export ACME_SERVER_TLS_VERIFY="${ACME_SERVER_TLS_VERIFY:-true}"

export CUSTOM_OCSP_STAPLING="${CUSTOM_OCSP_STAPLING:-false}"

export PUID="${PUID:-0}"
export PGID="${PGID:-0}"
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
export LISTEN_PROXY_PROTOCOL="${LISTEN_PROXY_PROTOCOL:-false}"
export DISABLE_H3_QUIC="${DISABLE_H3_QUIC:-false}"
export NGINX_QUIC_BPF="${NGINX_QUIC_BPF:-false}"
export NGINX_LOG_NOT_FOUND="${NGINX_LOG_NOT_FOUND:-false}"
export X_FRAME_OPTIONS="${X_FRAME_OPTIONS:-sameorigin}"
export NGINX_WORKER_PROCESSES="${NGINX_WORKER_PROCESSES:-auto}"
export NGINX_FORCE_X25519MLKEM768="${NGINX_FORCE_X25519MLKEM768:-false}"
export NGINX_DISABLE_TLS12="${NGINX_DISABLE_TLS12:-false}"
export NGINX_TRUST_SECPR1="${NGINX_TRUST_SECPR1:-false}"
export DISABLE_NGINX_BEAUTIFIER="${DISABLE_NGINX_BEAUTIFIER:-false}"
export SKIP_IP_RANGES="${SKIP_IP_RANGES:-true}"
export LOGROTATE="${LOGROTATE:-false}"
export LOGROTATIONS="${LOGROTATIONS:-3}"
export CRT="${CRT:-12}"
export GOA="${GOA:-false}"
export GOACLA="${GOACLA:-"--agent-list --real-os --double-decode --anonymize-ip --anonymize-level=1 --keep-last=30 --with-output-resolver --no-query-string"}"
export PHP83="${PHP83:-false}"
export PHP84="${PHP84:-false}"
export PHP85="${PHP85:-false}"
export INITIAL_DEFAULT_PAGE="${INITIAL_DEFAULT_PAGE:-congratulations}"
export DISABLE_GRAVATAR="${DISABLE_GRAVATAR:-false}"
export NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE="${NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE:-false}"
export NGINX_LOAD_GEOIP_MODULE="${NGINX_LOAD_GEOIP_MODULE:-false}"
export NGINX_LOAD_GEOIP2_MODULE="${NGINX_LOAD_GEOIP2_MODULE:-false}"
export NGINX_LOAD_LDAP_MODULE="${NGINX_LOAD_LDAP_MODULE:-false}"
export NGINX_LOAD_NTLM_MODULE="${NGINX_LOAD_NTLM_MODULE:-false}"
export NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE="${NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE:-false}"
export OIDC_REQUIRE_VERIFIED_EMAIL="${OIDC_REQUIRE_VERIFIED_EMAIL:-true}"
export OIDC_DISABLE_PASSWORD="${OIDC_DISABLE_PASSWORD:-false}"


#tmp
if [ -n "$NPM_DISABLE_IPV6" ]; then
    echo "NPM_DISABLE_IPV6 env is not supported. DISABLE_IPV6 now also disables IPv6 for the NPMplus web UI."
    sleep inf
fi
#tmp
if [ -n "$GOA_DISABLE_IPV6" ]; then
    echo "GOA_DISABLE_IPV6 env is not supported. DISABLE_IPV6 now also disables IPv6 for goaccess."
    sleep inf
fi
#tmp
if [ -n "$NIBEP" ]; then
    echo "NIBEP env is not supported. NPMplus now uses a unix socket instead."
    sleep inf
fi
#tmp
if [ -n "$GOAIWSP" ]; then
    echo "GOAIWSP env is not supported. NPMplus now uses a unix socket instead."
    sleep inf
fi

#tmp
if [ -n "$IPRT" ]; then
    echo "IPRT env is not supported. NPMplus now only updates and reloads if needed."
    sleep inf
fi

#tmp
if [ -n "$NGINX_HSTS_SUBDMAINS" ]; then
    echo "NGINX_HSTS_SUBDMAINS env is not supported. It was moved back to the WebUI."
    sleep inf
fi

#tmp
if [ -n "$NGINX_HSTS_SUBDOMAINS" ]; then
    echo "NGINX_HSTS_SUBDOMAINS env is not supported. It was moved back to the WebUI."
    sleep inf
fi

#tmp
if [ -n "$HTTP3_ALT_SVC_PORT" ]; then
    echo "HTTP3_ALT_SVC_PORT env is not supported. \$request_port (if empty 443) is now used instead."
    sleep inf
fi

#tmp
if [ -n "$NGINX_LOAD_FANCYINDEX_MODULE" ]; then
    echo "NGINX_LOAD_FANCYINDEX_MODULE env is not supported. The module is always loaded."
    sleep inf
fi

#tmp
if [ -n "$NGINX_LOAD_NJS_MODULE" ]; then
    echo "NGINX_LOAD_NJS_MODULE env is not supported. The module was removed."
    sleep inf
fi

#tmp
if [ -n "$NGINX_LOAD_OPENTELEMETRY_MODULE" ]; then
    echo "NGINX_LOAD_OPENTELEMETRY_MODULE env is not supported. The module was removed."
    sleep inf
fi

#tmp
if [ -n "$FULLCLEAN" ]; then
    echo "FULLCLEAN env is not supported anymore."
    sleep inf
fi

#tmp
if [ -n "$NGINX_DISABLE_PROXY_BUFFERING" ]; then
    echo "NGINX_DISABLE_PROXY_BUFFERING env is not supported anymore."
    sleep inf
fi

#tmp
if [ -n "$NGINX_404_REDIRECT" ]; then
    echo "NGINX_404_REDIRECT env is not supported anymore."
    sleep inf
fi

#tmp
if [ -n "$NGINX_WORKER_CONNECTIONS" ]; then
    echo "NGINX_WORKER_CONNECTIONS env is not supported anymore."
    sleep inf
fi


#upstream
if [ -n "$LE_SERVER" ]; then
    echo "LE_SERVER env is replaced by ACME_SERVER, please change it to ACME_SERVER"
    sleep inf
fi

#upstream
if [ -n "$LE_STAGING" ]; then
    echo "LE_STAGING env is not supported, please use ACME_SERVER."
    sleep inf
fi

#upstream
if [ -n "$DEBUG" ]; then
    echo "DEBUG env is not supported."
    sleep inf
fi

#upstream
if [ -n "$SKIP_CERTBOT_OWNERSHIP" ]; then
    echo "SKIP_CERTBOT_OWNERSHIP env is not supported."
    sleep inf
fi

#upstream
if [ -n "$IP_RANGES_FETCH_ENABLED" ]; then
    echo "IP_RANGES_FETCH_ENABLED env is not supported, please use SKIP_IP_RANGES."
    sleep inf
fi

#upstream
if [ -n "$DB_SQLITE_FILE" ]; then
    echo "DB_SQLITE_FILE env is not supported, the database needs to be in /data/npmplus/database.sqlite."
    sleep inf
fi


if [ -z "$TZ" ] || [ ! -s /usr/share/zoneinfo/"$TZ" ]; then
    echo "TZ is unset or invalid."
    sleep inf
fi


if ! echo "$ACME_SERVER" | grep -q "^https\?://"; then
    echo "ACME_SERVER needs to start with http:// or https://"
    sleep inf
fi

if [ -n "$ACME_EMAIL" ] && ! echo "$ACME_EMAIL" | grep -q "@"; then
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

if ! echo "$CUSTOM_OCSP_STAPLING" | grep -q "^true$\|^false$"; then
    echo "CUSTOM_OCSP_STAPLING needs to be true or false."
    sleep inf
fi

if [ "$ACME_PROFILE" != "none" ] && [ "$(curl -sSL "$ACME_SERVER" | jq .meta.profiles."$ACME_PROFILE")" = "null" ]; then
    echo "The ACME_PROFILE seems to be not supported by the ACME_SERVER."
    sleep inf
fi


if ! echo "$PUID" | grep -q "^[0-9]\+$"; then
    echo "PUID needs to be a number."
    sleep inf
fi

if ! echo "$PGID" | grep -q "^[0-9]\+$"; then
    echo "PGID needs to be a number"
    sleep inf
fi

if [ "$PGID" != "0" ] && [ "$PUID" = "0" ]; then
    echo "You've set PGID but not PUID. Which is required."
    sleep inf
fi

if [ "$PGID" = "0" ] && [ "$PUID" != "0" ]; then
    echo "You've set PUID but not PGID. Are you sure that this is what you wanted?"
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

if [ "$HTTP_PORT" = "$HTTPS_PORT" ] && [ "$DISABLE_HTTP" = "false" ]; then
    echo "HTTP_PORT and HTTPS_PORT need to be different."
    sleep inf
fi

if ! echo "$LISTEN_PROXY_PROTOCOL" | grep -q "^true$\|^false$"; then
    echo "LISTEN_PROXY_PROTOCOL needs to be true or false."
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

if ! echo "$X_FRAME_OPTIONS" | grep -q "^none$\|^sameorigin$\|^deny$"; then
    echo "X_FRAME_OPTIONS needs to be none, sameorigin or deny."
    sleep inf
fi

if ! echo "$NGINX_WORKER_PROCESSES" | grep -q "^auto$\|^[0-9]\+$"; then
    echo "NGINX_WORKER_PROCESSES needs to be auto or a number."
    sleep inf
fi

if ! echo "$NGINX_FORCE_X25519MLKEM768" | grep -q "^true$\|^false$"; then
    echo "NGINX_FORCE_X25519MLKEM768 needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_TRUST_SECPR1" | grep -q "^true$\|^false$"; then
    echo "NGINX_TRUST_SECPR1 needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_DISABLE_TLS12" | grep -q "^true$\|^false$"; then
    echo "NGINX_DISABLE_TLS12 needs to be true or false."
    sleep inf
fi

if ! echo "$DISABLE_NGINX_BEAUTIFIER" | grep -q "^true$\|^false$"; then
    echo "DISABLE_NGINX_BEAUTIFIER needs to be true or false."
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

if [ -n "$LOGROTATIONS" ] && ! echo "$LOGROTATIONS" | grep -q "^[0-9]\+$"; then
    echo "LOGROTATIONS needs to be a number."
    sleep inf
fi

if ! echo "$CRT" | grep -q "^[0-9]\+$"; then
    echo "CRT needs to be a number."
    sleep inf
fi


if ! echo "$GOA" | grep -q "^true$\|^false$"; then
    echo "GOA needs to be true or false."
    sleep inf
fi

if echo "$GOACLA" | grep -vq "geoip-database"; then
    if [ -s /data/etc/goaccess/geoip/GeoLite2-City.mmdb ] || [ -s /data/etc/goaccess/geoip/GeoLite2-Country.mmdb ]|| [ -s /data/etc/goaccess/geoip/GeoLite2-ASN.mmdb ]; then
        echo "All goaccess geoip databases need to be moved from etc/goaccess/geoip to goaccess/geoip inside the mounted data folder!"
        sleep inf
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


if ! echo "$PHP83" | grep -q "^true$\|^false$"; then
    echo "PHP83 needs to be true or false."
    sleep inf
fi

if [ -n "$PHP83_APKS" ] && [ "$PHP83" = "false" ]; then
    export PHP83="true"
    echo "setting PHP83 to true, since PHP83_APKS is set."
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
    export PHP84="true"
    echo "setting PHP84 to true, since PHP84_APKS is set."
fi

if [ -n "$PHP84_APKS" ] && ! echo "$PHP84_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
    echo "PHP84_APKS can consist of lower letters a-z, numbers 0-9, spaces, underscores and hyphens."
    sleep inf
fi


if ! echo "$PHP85" | grep -q "^true$\|^false$"; then
    echo "PHP85 needs to be true or false."
    sleep inf
fi

if [ -n "$PHP85_APKS" ] && [ "$PHP85" = "false" ]; then
    export PHP85="true"
    echo "setting PHP85 to true, since PHP85_APKS is set."
fi

if [ -n "$PHP85_APKS" ] && ! echo "$PHP85_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
    echo "PHP85_APKS can consist of lower letters a-z, numbers 0-9, spaces, underscores and hyphens."
    sleep inf
fi


if [ -n "$PHP_APKS" ] && [ "$PHP83" = "false" ] && [ "$PHP84" = "false" ] && [ "$PHP85" = "false" ]; then
    echo "PHP_APKS is set, but PHP83, PHP84 and PHP85 is disabled."
    sleep inf
fi


if [ -n "$INITIAL_ADMIN_EMAIL" ] && ! echo "$INITIAL_ADMIN_EMAIL" | grep -q "@.*\."; then
    echo "INITIAL_ADMIN_EMAIL needs to contains a @ and one dot."
    sleep inf
fi

if { [ -n "$INITIAL_ADMIN_EMAIL" ] || [ -n "$INITIAL_ADMIN_PASSWORD" ]; } && { [ -z "$INITIAL_ADMIN_EMAIL" ] || [ -z "$INITIAL_ADMIN_PASSWORD" ]; }; then
    echo "You need to set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (all are needed) or none of them."
    sleep inf
fi

if ! echo "$INITIAL_DEFAULT_PAGE" | grep -q "^\(404\|444\|redirect\|congratulations\|html\)$"; then
    echo "INITIAL_DEFAULT_PAGE needs to be 404, 444, redirect, congratulations or html."
    sleep inf
fi


if ! echo "$DISABLE_GRAVATAR" | grep -q "^true$\|^false$"; then
    echo "DISABLE_GRAVATAR needs to be true or false."
    sleep inf
fi


if ! echo "$NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE" | grep -q "^true$\|^false$"; then
    echo "NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_LOAD_GEOIP2_MODULE" | grep -q "^true$\|^false$"; then
    echo "NGINX_LOAD_GEOIP2_MODULE needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_LOAD_GEOIP_MODULE" | grep -q "^true$\|^false$"; then
    echo "NGINX_LOAD_GEOIP_MODULE needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_LOAD_LDAP_MODULE" | grep -q "^true$\|^false$"; then
    echo "NGINX_LOAD_LDAP_MODULE needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_LOAD_NTLM_MODULE" | grep -q "^true$\|^false$"; then
    echo "NGINX_LOAD_NTLM_MODULE needs to be true or false."
    sleep inf
fi

if ! echo "$NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE" | grep -q "^true$\|^false$"; then
    echo "NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE needs to be true or false."
    sleep inf
fi


if [ -n "$OIDC_REDIRECT_DOMAIN" ] && echo "$OIDC_REDIRECT_DOMAIN" | grep -q "/"; then
    echo "OIDC_REDIRECT_DOMAIN must not contain /."
    sleep inf
fi

if [ -n "$OIDC_ISSUER_URL" ] && ! echo "$OIDC_ISSUER_URL" | grep -q "^https://"; then
    echo "OIDC_ISSUER_URL needs to start with https://."
    sleep inf
fi

if ! echo "$OIDC_REQUIRE_VERIFIED_EMAIL" | grep -q "^true$\|^false$"; then
    echo "OIDC_REQUIRE_VERIFIED_EMAIL needs to be true or false."
    sleep inf
fi

if ! echo "$OIDC_DISABLE_PASSWORD" | grep -q "^true$\|^false$"; then
    echo "OIDC_DISABLE_PASSWORD needs to be true or false."
    sleep inf
fi

if { [ -n "$OIDC_REDIRECT_DOMAIN" ] || [ -n "$OIDC_ISSUER_URL" ] || [ -n "$OIDC_CLIENT_ID" ] || [ -n "$OIDC_CLIENT_SECRET" ]; } && { [ -z "$OIDC_REDIRECT_DOMAIN" ] || [ -z "$OIDC_ISSUER_URL" ] || [ -z "$OIDC_CLIENT_ID" ] || [ -z "$OIDC_CLIENT_SECRET" ]; }; then
    echo "You need to set OIDC_REDIRECT_DOMAIN, OIDC_ISSUER_URL, OIDC_CLIENT_ID AND OIDC_CLIENT_SECRET (all are needed) or none of them."
    sleep inf
elif [ "$OIDC_DISABLE_PASSWORD" = "true" ] && [ -z "$OIDC_REDIRECT_DOMAIN" ] && [ -z "$OIDC_ISSUER_URL" ] && [ -z "$OIDC_CLIENT_ID" ] && [ -z "$OIDC_CLIENT_SECRET" ]; then
    echo "You need to configure OIDC to enable OIDC_DISABLE_PASSWORD."
    sleep inf
fi


if [ "$ACME_MUST_STAPLE" = "true" ] && [ "$ACME_OCSP_STAPLING" = "false" ]; then
    export ACME_OCSP_STAPLING="true"
    echo "setting ACME_OCSP_STAPLING to true, since ACME_MUST_STAPLE is set to true."
fi
if [ "$LISTEN_PROXY_PROTOCOL" = "true" ] && [ "$DISABLE_H3_QUIC" = "false" ]; then
    export DISABLE_H3_QUIC="true"
    echo "setting DISABLE_H3_QUIC to true, since LISTEN_PROXY_PROTOCOL is set to true."
fi
if [ "$NGINX_FORCE_X25519MLKEM768" = "true" ] && [ "$NGINX_DISABLE_TLS12" = "false" ]; then
    export NGINX_DISABLE_TLS12="true"
    echo "setting NGINX_DISABLE_TLS12 to true, since NGINX_FORCE_X25519MLKEM768 is set to true."
fi
if [ "$NGINX_FORCE_X25519MLKEM768" = "true" ] && [ "$NGINX_TRUST_SECPR1" = "true" ]; then
    export NGINX_TRUST_SECPR1="false"
    echo "setting NGINX_TRUST_SECPR1 to false, since NGINX_FORCE_X25519MLKEM768 is set to true."
fi
if [ "$GOA" = "true" ] && [ "$LOGROTATE" = "false" ]; then
    export LOGROTATE="true"
    echo "setting LOGROTATE to true, since GOA is set to true."
fi


export TV="6"
if [ ! -s /data/npmplus/env.sha512sum ] || [ "$(cat /data/npmplus/env.sha512sum)" != "$( (grep "env\.[A-Z0-9_]\+" -roh /app/templates | sed "s|env.||g" | sort | uniq | xargs printenv; echo "$TV") | tr -d "\n" | sha512sum | cut -d" " -f1)" ]; then
    echo "At least one env or the template version changed, all hosts will be regenerated. Please make sure to read the changelog."
    export REGENERATE_ALL="true"
fi

exec start.sh
