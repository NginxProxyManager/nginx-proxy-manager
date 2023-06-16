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

if [ -n "$PGID" ] && [ -z "$PUID" ]; then
    echo "You've set PGID but not PUID. Running with PGID 0."
    export PGID="0"
fi

export PUID="${PUID:-0}"
if ! echo "$PUID" | grep -q "^[0-9]\+$"; then
    echo "You've set PUID but not to an allowed value."
    echo "It needs to be a string. Allowed are digits 0-9"
    echo "It is set to \"$PUID\"."
    sleep inf
fi

export PGID="${PGID:-0}"
if ! echo "$PGID" | grep -q "^[0-9]\+$"; then
    echo "You've set PGID but not to an allowed value."
    echo "It needs to be a string. Allowed are digits 0-9"
    echo "It is set to \"$PGID\"."
    sleep inf
fi

if [ -n "$IPV4_BINDING" ]; then
    if ! echo "$IPV4_BINDING" | grep -q "^[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+$"; then
        echo "You've set IPV4_BINDING but not to an allowed value."
        echo "It needs to be a string. Allowed are digits 0-9 and dots"
        echo "It is set to \"$IPV4_BINDING\"."
        sleep inf
    fi
fi

if [ "$DISABLE_IPV6" = "true" ] && [ -n "$IPV6_BINDING" ]; then
    echo "You can't disable IPv6 and set a binding for it."
    sleep inf
fi

if [ -n "$IPV6_BINDING" ]; then
    if ! echo "$IPV6_BINDING" | grep -q "\[[0-9a-f:]\+\]"; then
        echo "You've set IPV6_BINDING but not to an allowed value."
        echo "It needs to be a string. Allowed are small letters a-z, digits 0-9 and colons inside square bracket"
        echo "It is set to \"$IPV6_BINDING\"."
        sleep inf
    fi
fi

if { [ -n "$NPM_IPV4_BINDING" ] || [ -n "$NPM_IPV6_BINDING" ]; } && [ "$NPM_LISTEN_LOCALHOST" = "true" ]; then
    echo "You can't set IPv4/IPv6 bindings for npm, while NPM_LISTEN_LOCALHOST is enabled"
    sleep inf
fi

if [ "$NPM_LISTEN_LOCALHOST" = "true" ]; then
    export NPM_IPV4_BINDING="127.0.0.1"
    export NPM_IPV6_BINDING="[::1]"
fi

if [ -n "$NPM_IPV4_BINDING" ]; then
    if ! echo "$NPM_IPV4_BINDING" | grep -q "^[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+$"; then
        echo "You've set NPM_IPV4_BINDING but not to an allowed value."
        echo "It needs to be a string. Allowed are digits 0-9 and dots"
        echo "It is set to \"$NPM_IPV4_BINDING\"."
        sleep inf
    fi
fi

if [ "$NPM_DISABLE_IPV6" = "true" ] && [ -n "$NPM_IPV6_BINDING" ]; then
    echo "You can't disable IPv6 and set a binding for it."
    sleep inf
fi

if [ -n "$NPM_IPV6_BINDING" ]; then
    if ! echo "$NPM_IPV6_BINDING" | grep -q "\[[0-9a-f:]\+\]"; then
        echo "You've set NPM_IPV6_BINDING but not to an allowed value."
        echo "It needs to be a string. Allowed are small letters a-z, digits 0-9 and colons inside square bracket"
        echo "It is set to \"$NPM_IPV6_BINDING\"."
        sleep inf
    fi
fi

if [ "$PHP81" = "true" ] || [ "$PHP82" = "true" ]; then
    apk add --no-cache fcgi
fi

if [ "$PHP81" = "true" ]; then

apk add --no-cache php81-fpm

    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP81_APKS" ]; then
        if ! echo "$PHP81_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
            echo "You've set PHP81_APKS but not to an allowed value."
            echo "It needs to be a string. Allowed are small letters a-z, digits 0-9, spaces, hyphens and underscores."
            echo "It is set to \"$PHP81_APKS\"."
            sleep inf
        fi

        for apk in $(echo "$PHP81_APKS" | tr " " "\n"); do

            if ! echo "$apk" | grep -Ewq "php81-.*"; then
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
    sed -i "s|user =.*|user = root|" /data/php/81/php-fpm.d/www.conf
    sed -i "s|group =.*|group = root|" /data/php/81/php-fpm.d/www.conf
    sed -i "s|listen =.*|listen = /dev/php81.sock|" /data/php/81/php-fpm.d/www.conf
    sed -i "s|include=.*|include=/data/php/81/php-fpm.d/*.conf|g" /data/php/81/php-fpm.conf

else
    rm -vrf /data/php/81
fi

if [ "$PHP82" = "true" ]; then

apk add --no-cache php82-fpm

    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP82_APKS" ]; then
        if ! echo "$PHP82_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
            echo "You've set PHP82_APKS but not to an allowed value."
            echo "It needs to be a string. Allowed are small letters a-z, digits 0-9, spaces, hyphens and underscores."
            echo "It is set to \"$PHP82_APKS\"."
            sleep inf
        fi

        for apk in $(echo "$PHP82_APKS" | tr " " "\n"); do

            if ! echo "$apk" | grep -Ewq "php82-.*"; then
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
    sed -i "s|user =.*|user = root|" /data/php/82/php-fpm.d/www.conf
    sed -i "s|group =.*|group = root|" /data/php/82/php-fpm.d/www.conf
    sed -i "s|listen =.*|listen = /dev/php82.sock|" /data/php/82/php-fpm.d/www.conf
    sed -i "s|include=.*|include=/data/php/82/php-fpm.d/*.conf|g" /data/php/82/php-fpm.conf

else
    rm -vrf /data/php/82
fi

mkdir -p /tmp/acme-challenge \
         /tmp/certbot-work \
         /tmp/certbot-log \
         /tmp/npmhome

mkdir -vp /data/tls/certbot/renewal \
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

if [ -f /data/database.sqlite ] && [ "$DB_SQLITE_FILE" != "/data/database.sqlite" ]; then
    mv -vn /data/database.sqlite "$DB_SQLITE_FILE"
fi

if [ -f /data/nginx/default_host/site.conf ]; then
    mv -vn /data/nginx/default_host/site.conf /data/nginx/default.conf
fi

if [ -f /data/nginx/default_www/index.html ]; then
    mv -vn /data/nginx/default_www/index.html /data/nginx/html/index.html
fi

if [ -f /data/nginx/dummycert.pem ]; then
    mv -vn /data/nginx/dummycert.pem /data/tls/dummycert.pem
fi

if [ -f /data/nginx/dummykey.pem ]; then
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

if [ -z "$CLEAN" ]; then
    export CLEAN=true
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
fi

if [ -f "$DB_SQLITE_FILE" ]; then
    sqlite-vaccum.js
fi

if [ -z "$FULLCLEAN" ]; then
    export FULLCLEAN=false
fi

if [ "$FULLCLEAN" = "true" ]; then
    if [ "$PHP81" != "true" ] && [ "$PHP82" != "true" ]; then
        rm -vrf /data/php
    fi
    certbot-cleaner.sh
fi

find /data/nginx -type f -name '*.conf' -exec sed -i "s| http2||g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|\(listen .*\) http3|\1 quic|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|quic reuseport;|quic;|g" {} \;
sed -i "s|quic default_server|quic reuseport default_server|g" /data/nginx/default.conf

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

find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/force-ssl.conf;|include conf.d/include/force-tls.conf;|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/ssl-ciphers.conf;|include conf.d/include/tls-ciphers.conf;|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/letsencrypt-acme-challenge.conf;|include conf.d/include/acme-challenge.conf;|g" {} \;

find /data/nginx -type f -name '*.conf' -exec sed -i "/http3/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/Asset Caching/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/assets.conf/d" {} \;

find /data/nginx -type f -name '*.conf' -exec sed -i "/error_log/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/access_log/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/proxy_http_version/d" {} \;

find /data/nginx -type f -name '*.conf' -exec sed -i "/ssl_stapling/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/ssl_stapling_verify/d" {} \;

touch /data/etc/html/index.html \
      /data/etc/modsecurity/modsecurity.conf \
      /data/nginx/default.conf \
      /data/nginx/ip_ranges.conf \
      /data/nginx/custom/root.conf \
      /data/nginx/custom/events.conf \
      /data/nginx/custom/http.conf \
      /data/nginx/custom/http_top.conf \
      /data/nginx/custom/server_dead.conf \
      /data/nginx/custom/server_proxy.conf \
      /data/nginx/custom/server_redirect.conf \
      /data/nginx/custom/stream.conf \
      /data/nginx/custom/server_stream.conf \
      /data/nginx/custom/server_stream_tcp.conf \
      /data/nginx/custom/server_stream_udp.conf

cp -vn /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example /data/etc/modsecurity/crs-setup.conf
cp -v /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example /data/etc/modsecurity/crs-setup.conf.example

if [ -z "$NPM_CERT_ID" ]; then
    export NPM_CERT=/data/tls/dummycert.pem
    export NPM_KEY=/data/tls/dummykey.pem
    echo "no NPM_CERT_ID set, using dummycerts for npm and default hosts."
else
    if ! echo "$NPM_CERT_ID" | grep -q "[0-9]"; then
        echo "NPM_CERT_ID is a non allowed value."
        echo "It needs to be a number."
        echo "It is set to \"$NPM_CERT_ID\"."
        export NPM_CERT=/data/tls/dummycert.pem
        export NPM_KEY=/data/tls/dummykey.pem
        echo "using dummycerts for npm and default hosts."
    else

        if [ -d "/data/tls/certbot/live/npm-$NPM_CERT_ID" ]; then
            if ! ls /data/tls/certbot/live/npm-"$NPM_CERT_ID"/fullchain.pem > /dev/null 2>&1; then
                echo "/data/tls/certbot/live/npm-$NPM_CERT_ID/fullchain.pem does not exist"
                export NPM_CERT=/data/tls/dummycert.pem
                export NPM_KEY=/data/tls/dummykey.pem
                echo "using dummycerts for npm and default hosts."
            else
                export NPM_CERT=/data/tls/certbot/live/npm-"$NPM_CERT_ID"/fullchain.pem
                echo "NPM_CERT set to /data/tls/certbot/live/npm-$NPM_CERT_ID/fullchain.pem"

                if ! ls /data/tls/certbot/live/npm-"$NPM_CERT_ID"/privkey.pem > /dev/null 2>&1; then
                    echo "/data/tls/certbot/live/npm-$NPM_CERT_ID/privkey.pem does not exist"
                    export NPM_CERT=/data/tls/dummycert.pem
                    export NPM_KEY=/data/tls/dummykey.pem
                    echo "using dummycerts for npm and default hosts."
                else
                    export NPM_KEY=/data/tls/certbot/live/npm-"$NPM_CERT_ID"/privkey.pem
                    echo "NPM_KEY set to /data/tls/certbot/live/npm-$NPM_CERT_ID/privkey.pem"

                    if ! ls /data/tls/certbot/live/npm-"$NPM_CERT_ID"/chain.pem > /dev/null 2>&1; then
                        echo "/data/tls/certbot/live/npm-$NPM_CERT_ID/chain.pem does not exist"
                        export NPM_CERT=/data/tls/dummycert.pem
                        export NPM_KEY=/data/tls/dummykey.pem
                        echo "using dummycerts for npm and default hosts."
                    else
                        export NPM_CHAIN=/data/tls/certbot/live/npm-"$NPM_CERT_ID"/chain.pem
                        echo "NPM_CHAIN set to /data/tls/certbot/live/npm-$NPM_CERT_ID/chain.pem"
                    fi
                fi
            fi

        elif [ -d "/data/tls/custom/npm-$NPM_CERT_ID" ]; then
            if ! ls /data/tls/custom/npm-"$NPM_CERT_ID"/fullchain.pem > /dev/null 2>&1; then
                echo "/data/tls/custom/npm-$NPM_CERT_ID/fullchain.pem does not exist"
                export NPM_CERT=/data/tls/dummycert.pem
                export NPM_KEY=/data/tls/dummykey.pem
                echo "using dummycerts for npm and default hosts."
            else
                export NPM_CERT=/data/tls/custom/npm-"$NPM_CERT_ID"/fullchain.pem
                echo "NPM_CERT set to /data/tls/custom/npm-$NPM_CERT_ID/fullchain.pem"

                if ! ls /data/tls/custom/npm-"$NPM_CERT_ID"/privkey.pem > /dev/null 2>&1; then
                    echo "/data/tls/custom/npm-$NPM_CERT_ID/privkey.pem does not exist"
                    export NPM_CERT=/data/tls/dummycert.pem
                    export NPM_KEY=/data/tls/dummykey.pem
                    echo "using dummycerts for npm and default hosts."
                else
                    export NPM_KEY=/data/tls/custom/npm-"$NPM_CERT_ID"/privkey.pem
                    echo "NPM_KEY set to /data/tls/custom/npm-$NPM_CERT_ID/privkey.pem"

                    if ! ls /data/tls/custom/npm-"$NPM_CERT_ID"/chain.pem > /dev/null 2>&1; then
                        echo "/data/tls/custom/npm-$NPM_CERT_ID/chain.pem does not exist"
                        export NPM_CERT=/data/tls/dummycert.pem
                        export NPM_KEY=/data/tls/dummykey.pem
                        echo "using dummycerts for npm and default hosts."
                    else
                        export NPM_CHAIN=/data/tls/custom/npm-"$NPM_CERT_ID"/chain.pem
                        echo "NPM_CHAIN set to /data/tls/custom/npm-$NPM_CERT_ID/chain.pem"
                    fi
                fi
            fi

        else
            export NPM_CERT=/data/tls/dummycert.pem
            export NPM_KEY=/data/tls/dummykey.pem
            echo "cert with ID $NPM_CERT_ID does not exist, using dummycerts for npm and default hosts."
        fi
    fi
fi

if [ "$NPM_CERT" = "/data/tls/dummycert.pem" ] || [ "$NPM_KEY" = "/data/tls/dummykey.pem" ]; then
    if [ ! -f /data/tls/dummycert.pem ] || [ ! -f /data/tls/dummykey.pem ]; then
        openssl req -new -newkey rsa:4096 -days 365000 -nodes -x509 -subj '/CN=*' -sha256 -keyout /data/tls/dummykey.pem -out /data/tls/dummycert.pem
    fi
else
    rm -vrf /data/tls/dummycert.pem \
            /data/tls/dummykey.pem
fi

if [ "$DISABLE_IPV6" = "true" ]; then
    sed -i "s|#\?resolver .*|resolver local=on valid=10s ipv6=off;|g" /usr/local/nginx/conf/nginx.conf
else
    sed -i "s|#\?resolver .*|resolver local=on valid=10s;|g" /usr/local/nginx/conf/nginx.conf
fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $NPM_CERT;|g" /usr/local/nginx/conf/conf.d/include/default.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $NPM_KEY;|g" /usr/local/nginx/conf/conf.d/include/default.conf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $NPM_CHAIN;|g" /usr/local/nginx/conf/conf.d/include/default.conf; fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $NPM_CERT;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $NPM_KEY;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $NPM_CHAIN;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf; fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $NPM_CERT;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $NPM_KEY;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $NPM_CHAIN;|g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf; fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $NPM_CERT;|g" /usr/local/nginx/conf/conf.d/npm.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $NPM_KEY;|g" /usr/local/nginx/conf/conf.d/npm.conf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $NPM_CHAIN;|g" /usr/local/nginx/conf/conf.d/npm.conf; fi

sed -i "s|#\?ssl_certificate .*|ssl_certificate $NPM_CERT;|g" /app/templates/default.conf
sed -i "s|#\?ssl_certificate_key .*|ssl_certificate_key $NPM_KEY;|g" /app/templates/default.conf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#\?ssl_trusted_certificate .*|ssl_trusted_certificate $NPM_CHAIN;|g" /app/templates/default.conf; fi

export NIBEP="${NIBEP:-48693}"
sed -i "s|48693|$NIBEP|g" /app/index.js
sed -i "s|48693|$NIBEP|g" /usr/local/nginx/conf/conf.d/npm.conf

if [ -n "$IPV4_BINDING" ]; then
    sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\({{ incoming_port }}\)/listen $IPV4_BINDING:\2/g" /app/templates/stream.conf
    sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $IPV4_BINDING:\2/g" /usr/local/nginx/conf/conf.d/no-server-name.conf
    find /data/nginx -type f -name '*.conf' -exec sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $IPV4_BINDING:\2/g" {} \;
    find /app/templates -type f -name '*.conf' -exec sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $IPV4_BINDING:\2/g" {} \;
else
    sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\({{ incoming_port }}\)/listen \2/g" /app/templates/stream.conf
    sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen \2/g" /usr/local/nginx/conf/conf.d/no-server-name.conf
    find /data/nginx -type f -name '*.conf' -exec sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen \2/g" {} \;
    find /app/templates -type f -name '*.conf' -exec sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen \2/g" {} \;
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen \2/g" {} \;
fi

if [ "$DISABLE_IPV6" = "true" ]; then
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\({{ incoming_port }}\)/#listen \[\1\]:\2/g" /app/templates/stream.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" /usr/local/nginx/conf/conf.d/no-server-name.conf
    find /data/nginx -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" {} \;
    find /app/templates -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" {} \;
elif [ -n "$IPV6_BINDING" ]; then
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\({{ incoming_port }}\)/listen $IPV6_BINDING:\2/g" /app/templates/stream.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $IPV6_BINDING:\2/g" /usr/local/nginx/conf/conf.d/no-server-name.conf
    find /data/nginx -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $IPV6_BINDING:\2/g" {} \;
    find /app/templates -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $IPV6_BINDING:\2/g" {} \;
else
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\({{ incoming_port }}\)/listen \[::\]:\2/g" /app/templates/stream.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen \[::\]:\2/g" /usr/local/nginx/conf/conf.d/no-server-name.conf
    find /data/nginx -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen \[::\]:\2/g" {} \;
    find /app/templates -type f -name '*.conf' -exec sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen \[::\]:\2/g" {} \;
fi

export NPM_PORT="${NPM_PORT:-81}"

if [ -n "$NPM_IPV4_BINDING" ]; then
    sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $NPM_IPV4_BINDING:$NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $NPM_IPV4_BINDING:$NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
else
    sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s/#\?listen \([0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+:\)\?\([0-9]\+\)/listen $NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
fi

if [ "$NPM_DISABLE_IPV6" = "true" ]; then
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/#listen \[\1\]:\2/g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
elif [ -n "$NPM_IPV6_BINDING" ]; then
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $NPM_IPV6_BINDING:$NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen $NPM_IPV6_BINDING:$NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
else
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen \[::\]:$NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm.conf
    sed -i "s/#\?listen \[\([0-9a-f:]\+\)\]:\([0-9]\+\)/listen \[::\]:$NPM_PORT/g" /usr/local/nginx/conf/conf.d/npm-no-server-name.conf
fi

if [ "$DISABLE_HTTP" = "true" ]; then
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|#\1|g" {} \;
    find /app/templates -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|#\1|g" {} \;
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|#\1|g" {} \;
else
    find /data/nginx -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|\1|g" {} \;
    find /app/templates -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|\1|g" {} \;
    find /usr/local/nginx/conf/conf.d -type f -name '*.conf' -exec sed -i "s|#\?\(listen.*80\)|\1|g" {} \;
fi

if [ "$NGINX_LOG_NOT_FOUND" = "true" ]; then
    sed -i "s|log_not_found off;|log_not_found on;|g" /usr/local/nginx/conf/nginx.conf
fi

if [ ! -f /data/nginx/default.conf ]; then
    cp -vn /usr/local/nginx/conf/conf.d/include/default.conf /data/nginx/default.conf
fi

if [ ! -f /data/tls/certbot/config.ini ]; then
    cp -vn /etc/tls/certbot.ini /data/tls/certbot/config.ini
fi

if [ ! -f /data/etc/crowdsec/ban.html ]; then
    cp -vn /usr/local/nginx/conf/conf.d/include/ban.html /data/etc/crowdsec/ban.html
fi

if [ ! -f /data/etc/crowdsec/captcha.html ]; then
    cp -vn /usr/local/nginx/conf/conf.d/include/captcha.html /data/etc/crowdsec/captcha.html
fi

if [ ! -f /data/etc/crowdsec/crowdsec.conf ]; then
    cp -vn /usr/local/nginx/conf/conf.d/include/crowdsec.conf /data/etc/crowdsec/crowdsec.conf
fi

if grep -Eiq "ENABLED.*=.*true" /data/etc/crowdsec/crowdsec.conf; then
    cp -vn /usr/local/nginx/conf/conf.d/include/crowdsec_nginx.conf /usr/local/nginx/conf/conf.d/crowdsec.conf
else
    rm -vf /usr/local/nginx/conf/conf.d/crowdsec.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $NPM_CERT;|g" /data/nginx/default.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $NPM_KEY;|g" /data/nginx/default.conf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|ssl_trusted_certificate .*|ssl_trusted_certificate $NPM_CHAIN;|g" /data/nginx/default.conf; fi

find /data/nginx -type f -name '*.conf' -exec sed -i "s|add_header alt-svc 'h3=\":443\"; ma=86400, h3-29=\":443\"; ma=86400';|add_header Alt-Svc 'h3=\":443\"; ma=86400';|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "s|add_header alt-svc 'h3=\":443\";|add_header Alt-Svc 'h3=\":443\"; ma=86400';|g" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/ma=86400, h3-29=\":443\";/d" {} \;
find /data/nginx -type f -name '*.conf' -exec sed -i "/^[[:space:]]*ma=86400';[[:space:]]*$/d" {} \;

nginxbeautifier -s 4 -r /data/nginx

rm -f /usr/local/nginx/logs/nginx.pid

chmod -R 770 /data/tls \
             /data/etc/npm \
             /data/etc/access

if [ "$PUID" != "0" ]; then
    if id -u npm > /dev/null 2>&1; then
        usermod -u "$PUID" npm
    else
        useradd -o -u "$PUID" -U -d /tmp/npmhome -s /bin/false npm
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
    chown -R "$PUID:$PGID" /usr/local/certbot \
                           /usr/local/nginx \
                           /data \
                           /tmp
    sed -i "s|user root;|#user root;|g" /usr/local/nginx/conf/nginx.conf
    sudo -Eu npm launch.sh
else
    chown -R 0:0 /usr/local/certbot \
                 /usr/local/nginx \
                 /data \
                 /tmp
    sed -i "s|#\?user root;|user root;|g"  /usr/local/nginx/conf/nginx.conf
    launch.sh
fi
