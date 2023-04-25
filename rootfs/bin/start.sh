#!/bin/sh

if [ "$(id -u)" != "0" ]; then
	echo '--------------------------------------'
	echo "This docker container must be run as root, do not specify a user."
	echo '--------------------------------------'
    sleep inf || exit 1
fi

if [ ! -d /data ]; then
	echo '--------------------------------------'
	echo "/data is not mounted! Check your docker configuration."
	echo '--------------------------------------'
    sleep inf || exit 1
fi

export PUID="${PUID:-0}" || exit 1
if ! echo "$PUID" | grep -q "^[0-9]\+$"; then
    echo "You've set PUID but not to an allowed value." || sleep inf
    echo "It needs to be a string. Allowed are small digits 0-9" || sleep inf
    echo "It is set to \"$PUID\"." || sleep inf
    sleep inf || exit 1
fi

export PGID="${PGID:-0}" || exit 1
if ! echo "$PGID" | grep -q "^[0-9]\+$"; then
    echo "You've set PGID but not to an allowed value." || sleep inf
    echo "It needs to be a string. Allowed are small digits 0-9" || sleep inf
    echo "It is set to \"$PGID\"." || sleep inf
    sleep inf || exit 1
fi

if [ "$PHP81" = true ] || [ "$PHP82" = true ]; then
    apk add --no-cache fcgi
fi

if [ "$PHP81" = "true" ]; then

apk add --no-cache php81-fpm

    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP81_APKS" ]; then
        if ! echo "$PHP81_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
            echo "You've set PHP81_APKS but not to an allowed value." || sleep inf
            echo "It needs to be a string. Allowed are small letters a-z, digits 0-9, spaces, hyphens and underscores." || sleep inf
            echo "It is set to \"$PHP81_APKS\"." || sleep inf
            sleep inf || exit 1
        fi
    
        for apk in $(echo "$PHP81_APKS" | tr " " "\n"); do
    
            if ! echo "$apk" | grep -Ewq "php81-.*"; then
                echo "$apk is a non allowed value." || sleep inf
                echo "It needs to start with \"php81-\"." || sleep inf
                echo "It is set to \"$apk\"." || sleep inf
                sleep inf || exit 1
            fi
    
            echo "Installing $apk via apk..." || sleep inf
            if ! apk add --no-cache "$apk" > /dev/null 2>&1; then
                echo "The apk \"$apk\" was not installed!" || sleep inf
            fi

        done
    fi
    
    mkdir -vp /data/php
    cp -vrnT /etc/php81 /data/php/81 || sleep inf
    sed -i "s|user =.*|user = root|" /data/php/81/php-fpm.d/www.conf || sleep inf
    sed -i "s|group =.*|group = root|" /data/php/81/php-fpm.d/www.conf || sleep inf
    sed -i "s|listen =.*|listen = /dev/php81.sock|" /data/php/81/php-fpm.d/www.conf || sleep inf
    sed -i "s|include=.*|include=/data/php/81/php-fpm.d/*.conf|g" /data/php/81/php-fpm.conf || sleep inf

else
    rm -vrf /data/php/81
fi

if [ "$PHP82" = "true" ]; then

apk add --no-cache php82-fpm

    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP82_APKS" ]; then
        if ! echo "$PHP82_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
            echo "You've set PHP82_APKS but not to an allowed value." || sleep inf
            echo "It needs to be a string. Allowed are small letters a-z, digits 0-9, spaces, hyphens and underscores." || sleep inf
            echo "It is set to \"$PHP82_APKS\"." || sleep inf
            sleep inf || exit 1
        fi
    
        for apk in $(echo "$PHP82_APKS" | tr " " "\n"); do
    
            if ! echo "$apk" | grep -Ewq "php82-.*"; then
                echo "$apk is a non allowed value." || sleep inf
                echo "It needs to start with \"php82-\"." || sleep inf
                echo "It is set to \"$apk\"." || sleep inf
                sleep inf || exit 1
            fi
    
            echo "Installing $apk via apk..." || sleep inf
            if ! apk add --no-cache "$apk" > /dev/null 2>&1; then
                echo "The apk \"$apk\" was not installed!" || sleep inf
            fi

        done
    fi
    
    mkdir -vp /data/php
    cp -vrnT /etc/php82 /data/php/82 || sleep inf
    sed -i "s|user =.*|user = root|" /data/php/82/php-fpm.d/www.conf || sleep inf
    sed -i "s|group =.*|group = root|" /data/php/82/php-fpm.d/www.conf || sleep inf
    sed -i "s|listen =.*|listen = /dev/php82.sock|" /data/php/82/php-fpm.d/www.conf || sleep inf
    sed -i "s|include=.*|include=/data/php/82/php-fpm.d/*.conf|g" /data/php/82/php-fpm.conf || sleep inf

else
    rm -vrf /data/php/82
fi

mkdir -p /tmp/acme-challenge \
         /tmp/certbot-work \
         /tmp/certbot-log || sleep inf

mkdir -vp /data/tls/certbot/renewal \
          /data/tls/custom \
          /data/etc/npm \
          /data/etc/html \
          /data/etc/access \
          /data/nginx/redirection_host \
          /data/nginx/proxy_host \
          /data/nginx/dead_host \
          /data/nginx/stream \
          /data/nginx/custom || sleep inf

if [ -f /data/database.sqlite ] && [ "$DB_SQLITE_FILE" != "/data/database.sqlite" ]; then
    mv -vn /data/database.sqlite "$DB_SQLITE_FILE" || sleep inf
fi

if [ -f /data/nginx/default_host/site.conf ]; then
    mv -vn /data/nginx/default_host/site.conf /data/nginx/default.conf || sleep inf
fi

if [ -f /data/nginx/default_www/index.html ]; then
    mv -vn /data/nginx/default_www/index.html /data/nginx/html/index.html || sleep inf
fi

if [ -f /data/nginx/dummycert.pem ]; then
    mv -vn /data/nginx/dummycert.pem /data/tls/dummycert.pem || sleep inf
fi

if [ -f /data/nginx/dummykey.pem ]; then
    mv -vn /data/nginx/dummykey.pem /data/tls/dummykey.pem || sleep inf
fi

if [ -n "$(ls -A /data/nginx/html 2> /dev/null)" ]; then
    mv -v /data/nginx/html/* /data/etc/html|| sleep inf
fi

if [ -n "$(ls -A /data/access 2> /dev/null)" ]; then
    mv -v /data/access/* /data/etc/access || sleep inf
fi

if [ -n "$(ls -A /data/nginx/access 2> /dev/null)" ]; then
    mv -v /data/nginx/access/* /data/etc/access || sleep inf
fi

if [ -n "$(ls -A /etc/letsencrypt 2> /dev/null)" ]; then
    mv -v /etc/letsencrypt/* /data/tls/certbot || sleep inf
fi

if [ -n "$(ls -A /data/letsencrypt 2> /dev/null)" ]; then
    mv -v /data/letsencrypt/* /data/tls/certbot || sleep inf
fi

if [ -n "$(ls -A /data/custom_ssl 2> /dev/null)" ]; then
    mv -v /data/custom_ssl/* /data/tls/custom || sleep inf
fi

if [ -n "$(ls -A /data/ssl 2> /dev/null)" ]; then
    mv -v /data/ssl/* /data/tls || sleep inf
fi

if [ -z "$CLEAN" ]; then
    export CLEAN=true
fi

if [ "$CLEAN" = true ]; then
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
            /data/nginx/error.log || sleep inf
fi

if [ -f "$DB_SQLITE_FILE" ]; then
    sqlite-vaccum.js || exit 1
fi

if [ -z "$FULLCLEAN" ]; then
    export FULLCLEAN=false
fi

if [ "$FULLCLEAN" = true ]; then
    if [ "$PHP81" != true ] && [ "$PHP82" != true ]; then
        rm -vrf /data/php
    fi    
    certbot-cleaner.sh
fi

find /data/nginx -type f -name '*.conf' -exec sed -i "s|listen 80 http2|listen 80|g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s|\(listen .*\) http3|\1 quic|g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/nginx/html/|/data/etc/html/|g" {} \; || sleep inf

find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/access|/data/nginx/access|g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/nginx/access|/data/etc/access|g" {} \; || sleep inf

find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/custom_ssl|/data/tls/custom|g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s|/etc/letsencrypt|/data/tls/certbot|g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/letsencrypt|/data/tls/certbot|g" {} \; || sleep inf

find /data/nginx -type f -name '*.conf' -exec sed -i "s|/data/ssl|/data/tls|g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s|ssl_certificate_key /data/nginx/dummykey.pem;|ssl_certificate_key /data/tls/dummykey.pem;|g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s|ssl_certificate /data/nginx/dummycert.pem;|ssl_certificate /data/tls/dummycert.pem;|g" {} \; || sleep inf

find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/data/ssl|/data/tls|g" {} \; || sleep inf
find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/etc/letsencrypt|/data/tls/certbot|g" {} \; || sleep inf
find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/data/letsencrypt|/data/tls/certbot|g" {} \; || sleep inf

find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/force-ssl.conf;|include conf.d/include/force-tls.conf;|g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/ssl-ciphers.conf;|include conf.d/include/tls-ciphers.conf;|g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/letsencrypt-acme-challenge.conf;|include conf.d/include/acme-challenge.conf;|g" {} \; || sleep inf

find /data/nginx -type f -name '*.conf' -exec sed -i "/Asset Caching/d" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "/assets.conf/d" {} \; || sleep inf

find /data/nginx -type f -name '*.conf' -exec sed -i "/access_log/d" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "/proxy_http_version/d" {} \; || sleep inf

find /data/nginx -type f -name '*.conf' -exec sed -i "/ssl_stapling/d" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "/ssl_stapling_verify/d" {} \; || sleep inf

touch /data/etc/html/index.html \
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
      /data/nginx/custom/server_stream_udp.conf || sleep inf

if [ -z "$NPM_CERT_ID" ]; then
    export NPM_CERT=/data/tls/dummycert.pem || sleep inf
    export NPM_KEY=/data/tls/dummykey.pem || sleep inf
    echo "no NPM_CERT_ID set, using dummycerts for npm and default hosts." || sleep inf
else
    if ! echo "$NPM_CERT_ID" | grep -q "[0-9]"; then
        echo "NPM_CERT_ID is a non allowed value." || sleep inf
        echo "It needs to be a number." || sleep inf
        echo "It is set to \"$NPM_CERT_ID\"." || sleep inf
        export NPM_CERT=/data/tls/dummycert.pem || sleep inf
        export NPM_KEY=/data/tls/dummykey.pem || sleep inf
        echo "using dummycerts for npm and default hosts." || sleep inf
    else
    
        if [ -d "/data/tls/certbot/live/npm-$NPM_CERT_ID" ]; then
            if ! ls /data/tls/certbot/live/npm-"$NPM_CERT_ID"/fullchain.pem > /dev/null 2>&1; then
                echo "/data/tls/certbot/live/npm-$NPM_CERT_ID/fullchain.pem does not exist" || sleep inf
                export NPM_CERT=/data/tls/dummycert.pem || sleep inf
                export NPM_KEY=/data/tls/dummykey.pem || sleep inf
                echo "using dummycerts for npm and default hosts." || sleep inf
            else
                export NPM_CERT=/data/tls/certbot/live/npm-"$NPM_CERT_ID"/fullchain.pem || sleep inf
                echo "NPM_CERT set to /data/tls/certbot/live/npm-$NPM_CERT_ID/fullchain.pem" || sleep inf
            
                if ! ls /data/tls/certbot/live/npm-"$NPM_CERT_ID"/privkey.pem > /dev/null 2>&1; then
                    echo "/data/tls/certbot/live/npm-$NPM_CERT_ID/privkey.pem does not exist" || sleep inf
                    export NPM_CERT=/data/tls/dummycert.pem || sleep inf
                    export NPM_KEY=/data/tls/dummykey.pem || sleep inf
                    echo "using dummycerts for npm and default hosts." || sleep inf
                else
                    export NPM_KEY=/data/tls/certbot/live/npm-"$NPM_CERT_ID"/privkey.pem || sleep inf
                    echo "NPM_KEY set to /data/tls/certbot/live/npm-$NPM_CERT_ID/privkey.pem" || sleep inf
            
                    if ! ls /data/tls/certbot/live/npm-"$NPM_CERT_ID"/chain.pem > /dev/null 2>&1; then
                        echo "/data/tls/certbot/live/npm-$NPM_CERT_ID/chain.pem does not exist" || sleep inf
                        export NPM_CERT=/data/tls/dummycert.pem || sleep inf
                        export NPM_KEY=/data/tls/dummykey.pem || sleep inf
                        echo "using dummycerts for npm and default hosts." || sleep inf
                    else
                        export NPM_CHAIN=/data/tls/certbot/live/npm-"$NPM_CERT_ID"/chain.pem || sleep inf
                        echo "NPM_CHAIN set to /data/tls/certbot/live/npm-$NPM_CERT_ID/chain.pem" || sleep inf
                    fi
                fi
            fi
            
        elif [ -d "/data/tls/custom/npm-$NPM_CERT_ID" ]; then
            if ! ls /data/tls/custom/npm-"$NPM_CERT_ID"/fullchain.pem > /dev/null 2>&1; then
                echo "/data/tls/custom/npm-$NPM_CERT_ID/fullchain.pem does not exist" || sleep inf
                export NPM_CERT=/data/tls/dummycert.pem || sleep inf
                export NPM_KEY=/data/tls/dummykey.pem || sleep inf
                echo "using dummycerts for npm and default hosts." || sleep inf
            else
                export NPM_CERT=/data/tls/custom/npm-"$NPM_CERT_ID"/fullchain.pem || sleep inf
                echo "NPM_CERT set to /data/tls/custom/npm-$NPM_CERT_ID/fullchain.pem" || sleep inf
            
                if ! ls /data/tls/custom/npm-"$NPM_CERT_ID"/privkey.pem > /dev/null 2>&1; then
                    echo "/data/tls/custom/npm-$NPM_CERT_ID/privkey.pem does not exist" || sleep inf
                    export NPM_CERT=/data/tls/dummycert.pem || sleep inf
                    export NPM_KEY=/data/tls/dummykey.pem || sleep inf
                    echo "using dummycerts for npm and default hosts." || sleep inf
                else
                    export NPM_KEY=/data/tls/custom/npm-"$NPM_CERT_ID"/privkey.pem || sleep inf
                    echo "NPM_KEY set to /data/tls/custom/npm-$NPM_CERT_ID/privkey.pem" || sleep inf
            
                    if ! ls /data/tls/custom/npm-"$NPM_CERT_ID"/chain.pem > /dev/null 2>&1; then
                        echo "/data/tls/custom/npm-$NPM_CERT_ID/chain.pem does not exist" || sleep inf
                        export NPM_CERT=/data/tls/dummycert.pem || sleep inf
                        export NPM_KEY=/data/tls/dummykey.pem || sleep inf
                        echo "using dummycerts for npm and default hosts." || sleep inf
                    else
                        export NPM_CHAIN=/data/tls/custom/npm-"$NPM_CERT_ID"/chain.pem || sleep inf
                        echo "NPM_CHAIN set to /data/tls/custom/npm-$NPM_CERT_ID/chain.pem" || sleep inf
                    fi
                fi
            fi
            
        else
            export NPM_CERT=/data/tls/dummycert.pem || sleep inf
            export NPM_KEY=/data/tls/dummykey.pem || sleep inf
            echo "cert with ID $NPM_CERT_ID does not exist, using dummycerts for npm and default hosts." || sleep inf
        fi
    fi
fi

ns="$(tr "[:upper:]" "[:lower:]" < /etc/resolv.conf | grep -P "^nameserver ((?:[0-9.]+)|(?:[0-9a-f:]+))$" | awk 'BEGIN{ORS=" "} $1=="nameserver" {print ($2 ~ ":")? "["$2"]": $2}' | sed "s| *$||")"
export ns
sed -i "s|resolver.*|resolver $ns;|g" /usr/local/nginx/conf/nginx.conf || sleep inf
echo "using this nameservers: \"$ns\"" || sleep inf

sed -i "s|#ssl_certificate .*|ssl_certificate $NPM_CERT;|g" /usr/local/nginx/conf/conf.d/include/default.conf || sleep inf
sed -i "s|#ssl_certificate_key .*|ssl_certificate_key $NPM_KEY;|g" /usr/local/nginx/conf/conf.d/include/default.conf || sleep inf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#ssl_trusted_certificate .*|ssl_trusted_certificate $NPM_CHAIN;|g" /usr/local/nginx/conf/conf.d/include/default.conf || sleep inf; fi

sed -i "s|#ssl_certificate .*|ssl_certificate $NPM_CERT;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf || sleep inf
sed -i "s|#ssl_certificate_key .*|ssl_certificate_key $NPM_KEY;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf || sleep inf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#ssl_trusted_certificate .*|ssl_trusted_certificate $NPM_CHAIN;|g" /usr/local/nginx/conf/conf.d/no-server-name.conf || sleep inf; fi

sed -i "s|#ssl_certificate .*|ssl_certificate $NPM_CERT;|g" /usr/local/nginx/conf/conf.d/npm.conf || sleep inf
sed -i "s|#ssl_certificate_key .*|ssl_certificate_key $NPM_KEY;|g" /usr/local/nginx/conf/conf.d/npm.conf || sleep inf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#ssl_trusted_certificate .*|ssl_trusted_certificate $NPM_CHAIN;|g" /usr/local/nginx/conf/conf.d/npm.conf || sleep inf; fi

sed -i "s|#ssl_certificate .*|ssl_certificate $NPM_CERT;|g" /app/templates/default.conf || sleep inf
sed -i "s|#ssl_certificate_key .*|ssl_certificate_key $NPM_KEY;|g" /app/templates/default.conf || sleep inf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#ssl_trusted_certificate .*|ssl_trusted_certificate $NPM_CHAIN;|g" /app/templates/default.conf || sleep inf; fi

if [ "$NPM_LISTEN_LOCALHOST" = "true" ]; then
    sed -i "s|listen 81|listen 127.0.0.1:81|g" /usr/local/nginx/conf/conf.d/npm.conf || sleep inf
    sed -i "s|listen \[::\]:81|listen \[::1\]:81|g" /usr/local/nginx/conf/conf.d/npm.conf || sleep inf
    sed -i "s|listen 81|listen 127.0.0.1:81|g" /usr/local/nginx/conf/conf.d/no-server-name.conf || sleep inf
    sed -i "s|listen \[::\]:81|listen \[::1\]:81|g" /usr/local/nginx/conf/conf.d/no-server-name.conf || sleep inf
fi

if [ "$NGINX_LOG_NOT_FOUND" = "true" ]; then
    sed -i "s|log_not_found off;|log_not_found on;|g" /usr/local/nginx/conf/nginx.conf || sleep inf
fi

if [ -z "$NPM_CERT_ID" ]; then
    if [ ! -f /data/tls/dummycert.pem ] || [ ! -f /data/tls/dummykey.pem ]; then
        openssl req -new -newkey rsa:4096 -days 365000 -nodes -x509 -subj '/CN=*' -sha256 -keyout /data/tls/dummykey.pem -out /data/tls/dummycert.pem || sleep inf
    fi
else 
    rm -vrf /data/tls/dummycert.pem \
            /data/tls/dummykey.pem || sleep inf
fi

if [ ! -f /data/nginx/default.conf ]; then
    mv -vn /usr/local/nginx/conf/conf.d/include/default.conf /data/nginx/default.conf || sleep inf
fi

if [ ! -f /data/tls/certbot/config.ini ]; then
    mv -vn /etc/tls/certbot.ini /data/tls/certbot/config.ini || sleep inf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $NPM_CERT;|g" /data/nginx/default.conf || sleep inf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $NPM_KEY;|g" /data/nginx/default.conf || sleep inf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|ssl_trusted_certificate .*|ssl_trusted_certificate $NPM_CHAIN;|g" /data/nginx/default.conf || sleep inf; fi


chmod -R o-rwx /data/tls \
               /data/etc/npm \
               /data/etc/access || exit 1

if [ "$PUID" != "0" ]; then
    if id -u npmuser > /dev/null 2>&1; then
        usermod -u "$PUID" npmuser || exit 1
    else
        useradd -o -u "$PUID" -U -d /tmp/npmuserhome -s /bin/false npmuser || exit 1
    fi
    usermod -G "$PGID" npmuser || exit 1
    groupmod -o -g "$PGID" npmuser || exit 1
    chown -R "$PUID:$PGID" /usr/local/certbot \
                           /usr/local/nginx \
                           /data \
                           /tmp/acme-challenge \
                           /tmp/certbot-work \
                           /tmp/certbot-log || exit 1
    sed -i "s|user root;|#user root;|g"  /usr/local/nginx/conf/nginx.conf || sleep inf
    sudo -Eu npmuser launch.sh || exit 1
else
    chown -R 0:0 /usr/local/certbot \
                 /usr/local/nginx \
                 /data \
                 /tmp/acme-challenge \
                 /tmp/certbot-work \
                 /tmp/certbot-log || exit 1
    sed -i "s|#user root;|user root;|g"  /usr/local/nginx/conf/nginx.conf || sleep inf
    launch.sh || exit 1
fi
