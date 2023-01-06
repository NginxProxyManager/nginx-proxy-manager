#!/bin/bash

# From https://github.com/nextcloud/all-in-one/pull/1377/files
if [ -n "$PHP_APKS" ]; then
    if ! echo "$PHP_APKS" | grep -q "^[a-z0-9 _-]\+$"; then
        echo "You've set PHP_APKS but not to an allowed value." || echo "error 1"
        echo "It needs to be a string. Allowed are small letters a-z, digits 0-9, spaces, hyphens and underscores." || echo "error 2"
        echo "It is set to \""$PHP_APKS"\"." ||  echo "error 3"
        sleep inf || exit 1
    fi
    
    
    read -ra APKS_ARRAY <<< "$PHP_APKS" || sleep inf
    for apk in "${APKS_ARRAY[@]}"; do
    
        if ! echo "$apk" | grep -Ewq "php81-.*|php82-.*"; then
            echo ""$apk" is a non allowed value." ||  echo "error 4"
            echo "It needs to start with \"php81-\" or \"php82-\"." ||  echo "error 5"
            echo "It is set to \""$apk"\"." ||  echo "error 6"
            sleep inf || exit 1
        fi
    
        echo "Installing "$apk" via apk..." | echo "error 7"
        if ! apk add --no-cache "$apk" &> /dev/null; then
            echo "The apk \""$apk"\" was not installed!" ||  echo "error 8"
        fi

    done
fi

mkdir -vp /data/tls/certbot/renewal \
          /data/tls/custom \
          /data/php \
          /data/etc/html \
          /data/etc/access \
          /data/nginx/redirection_host \
          /data/nginx/proxy_host \
          /data/nginx/dead_host \
          /data/nginx/stream \
          /data/nginx/custom \
          /tmp/acme-challenge || sleep inf

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

rm -vrf /data/nginx/default_host/site.conf \
        /data/nginx/default_www/index.html \
        /data/letsencrypt-acme-challenge \
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

find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/ssl-ciphers.conf;|include conf.d/include/tls-ciphers.conf;|g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/letsencrypt-acme-challenge.conf;|include conf.d/include/acme-challenge.conf;|g" {} \; || sleep inf

find /data/nginx -type f -name '*.conf' -exec sed -i "s/# Asset Caching//g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s|include conf.d/include/assets.conf;||g" {} \; || sleep inf

find /data/nginx -type f -name '*.conf' -exec sed -i "s/access_log.*//g" {} \; || sleep inf
find /data/nginx -type f -name '*.conf' -exec sed -i "s/proxy_http_version.*//g" {} \; || sleep inf

touch /data/etc/html/index.html \
      /data/nginx/default.conf \
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
      /data/nginx/custom/server_stream_udp.conf \
      /usr/local/nginx/conf/conf.d/include/ip_ranges.conf || sleep inf

for phpv in $(ls -1 /etc | grep php | sed "s|php||g"); do cp -vrnT /etc/php"$phpv" /data/php/"$phpv"; done;
for phpv in $(ls -1 /etc | grep php | sed "s|php||g"); do sed -i "s|user =.*|user = root|" /data/php/"$phpv"/php-fpm.d/www.conf; done;
for phpv in $(ls -1 /etc | grep php | sed "s|php||g"); do sed -i "s|group =.*|group = root|" /data/php/"$phpv"/php-fpm.d/www.conf; done;
for phpv in $(ls -1 /etc | grep php | sed "s|php||g"); do sed -i "s|listen =.*|listen = /dev/php"$phpv".sock|" /data/php/"$phpv"/php-fpm.d/www.conf; done;
for phpv in $(ls -1 /etc | grep php | sed "s|php||g"); do sed -i "s|include=.*|include=/data/php/"$phpv"/php-fpm.d/*.conf|g" /data/php/"$phpv"/php-fpm.conf; done;

if [ -z "$NPM_CERT_ID" ]; then
    export NPM_CERT=/data/tls/dummycert.pem
    export NPM_KEY=/data/tls/dummykey.pem
    echo "no NPM_CERT_ID set, using dummycerts for npm and default hosts." || echo "error 9"
else
    if ! echo "$NPM_CERT_ID" | grep -q [0-9]; then
        echo "NPM_CERT_ID is a non allowed value." || echo "error 10"
        echo "It needs to be a number." || echo "error 11"
        echo "It is set to \""$NPM_CERT_ID"\"." || echo "error 12"
        export NPM_CERT=/data/tls/dummycert.pem
        export NPM_KEY=/data/tls/dummykey.pem
        echo "using dummycerts for npm and default hosts." || echo "error 13"
    else
    
        if [ -d "/data/tls/certbot/live/npm-"$NPM_CERT_ID"" ]; then
            if ! ls /data/tls/certbot/live/npm-"$NPM_CERT_ID"/fullchain.pem &> /dev/null; then
                echo "/data/tls/certbot/live/npm-"$NPM_CERT_ID"/fullchain.pem does not exist" || echo "error 14"
                export NPM_CERT=/data/tls/dummycert.pem
                export NPM_KEY=/data/tls/dummykey.pem
                echo "using dummycerts for npm and default hosts." || echo "error 15"
            else
                export NPM_CERT=/data/tls/certbot/live/npm-"$NPM_CERT_ID"/fullchain.pem
                echo "NPM_CERT set to /data/tls/certbot/live/npm-"$NPM_CERT_ID"/fullchain.pem" || echo "error 16"
            
                if ! ls /data/tls/certbot/live/npm-"$NPM_CERT_ID"/privkey.pem &> /dev/null; then
                    echo "/data/tls/certbot/live/npm-"$NPM_CERT_ID"/privkey.pem does not exist" || echo "error 17"
                    export NPM_CERT=/data/tls/dummycert.pem
                    export NPM_KEY=/data/tls/dummykey.pem
                    echo "using dummycerts for npm and default hosts." || echo "error 18"
                else
                    export NPM_KEY=/data/tls/certbot/live/npm-"$NPM_CERT_ID"/privkey.pem
                    echo "NPM_KEY set to /data/tls/certbot/live/npm-"$NPM_CERT_ID"/privkey.pem" || echo "error 19"
            
                    if ! ls /data/tls/certbot/live/npm-"$NPM_CERT_ID"/chain.pem &> /dev/null; then
                        echo "/data/tls/certbot/live/npm-"$NPM_CERT_ID"/chain.pem does not exist" || echo "error 20"
                        export NPM_CERT=/data/tls/dummycert.pem
                        export NPM_KEY=/data/tls/dummykey.pem
                        echo "using dummycerts for npm and default hosts." || echo "error 21"
                    else
                        export NPM_CHAIN=/data/tls/certbot/live/npm-"$NPM_CERT_ID"/chain.pem
                        echo "NPM_CHAIN set to /data/tls/certbot/live/npm-"$NPM_CERT_ID"/chain.pem" || echo "error 22"
                    fi
                fi
            fi
            
        elif [ -d "/data/tls/custom/npm-"$NPM_CERT_ID"" ]; then
            if ! ls /data/tls/custom/npm-"$NPM_CERT_ID"/fullchain.pem &> /dev/null; then
                echo "/data/tls/custom/npm-"$NPM_CERT_ID"/fullchain.pem does not exist" || echo "error 23"
                export NPM_CERT=/data/tls/dummycert.pem
                export NPM_KEY=/data/tls/dummykey.pem
                echo "using dummycerts for npm and default hosts." || echo "error 24"
            else
                export NPM_CERT=/data/tls/custom/npm-"$NPM_CERT_ID"/fullchain.pem
                echo "NPM_CERT set to /data/tls/custom/npm-"$NPM_CERT_ID"/fullchain.pem" || echo "error 25"
            
                if ! ls /data/tls/custom/npm-"$NPM_CERT_ID"/privkey.pem &> /dev/null; then
                    echo "/data/tls/custom/npm-"$NPM_CERT_ID"/privkey.pem does not exist" || echo "error 26"
                    export NPM_CERT=/data/tls/dummycert.pem
                    export NPM_KEY=/data/tls/dummykey.pem
                    echo "using dummycerts for npm and default hosts." || echo "error 27"
                else
                    export NPM_KEY=/data/tls/custom/npm-"$NPM_CERT_ID"/privkey.pem
                    echo "NPM_KEY set to /data/tls/custom/npm-"$NPM_CERT_ID"/privkey.pem"
            
                    if ! ls /data/tls/custom/npm-"$NPM_CERT_ID"/chain.pem &> /dev/null; then
                        echo "/data/tls/custom/npm-"$NPM_CERT_ID"/chain.pem does not exist" || echo "error 28"
                        export NPM_CERT=/data/tls/dummycert.pem
                        export NPM_KEY=/data/tls/dummykey.pem
                        echo "using dummycerts for npm and default hosts." || echo "error 29"
                    else
                        export NPM_CHAIN=/data/tls/custom/npm-"$NPM_CERT_ID"/chain.pem
                        echo "NPM_CHAIN set to /data/tls/custom/npm-"$NPM_CERT_ID"/chain.pem" || echo "error 30"
                    fi
                fi
            fi
            
        else
            export NPM_CERT=/data/tls/dummycert.pem
            export NPM_KEY=/data/tls/dummykey.pem
            echo "cert with ID "$NPM_CERT_ID" does not exist, using dummycerts for npm and default hosts." || echo "error 31"
        fi
    fi
fi

sed -i "s|#ssl_certificate .*|ssl_certificate "$NPM_CERT";|g" /usr/local/nginx/conf/conf.d/include/default.conf
sed -i "s|#ssl_certificate_key .*|ssl_certificate_key "$NPM_KEY";|g" /usr/local/nginx/conf/conf.d/include/default.conf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#ssl_trusted_certificate .*|ssl_trusted_certificate "$NPM_CHAIN";|g" /usr/local/nginx/conf/conf.d/include/default.conf; fi

sed -i "s|#ssl_certificate .*|ssl_certificate "$NPM_CERT";|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
sed -i "s|#ssl_certificate_key .*|ssl_certificate_key "$NPM_KEY";|g" /usr/local/nginx/conf/conf.d/no-server-name.conf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#ssl_trusted_certificate .*|ssl_trusted_certificate "$NPM_CHAIN";|g" /usr/local/nginx/conf/conf.d/no-server-name.conf; fi

sed -i "s|#ssl_certificate .*|ssl_certificate "$NPM_CERT";|g" /usr/local/nginx/conf/conf.d/npm.conf
sed -i "s|#ssl_certificate_key .*|ssl_certificate_key "$NPM_KEY";|g" /usr/local/nginx/conf/conf.d/npm.conf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#ssl_trusted_certificate .*|ssl_trusted_certificate "$NPM_CHAIN";|g" /usr/local/nginx/conf/conf.d/npm.conf; fi

sed -i "s|#ssl_certificate .*|ssl_certificate "$NPM_CERT";|g" /app/templates/default.conf
sed -i "s|#ssl_certificate_key .*|ssl_certificate_key "$NPM_KEY";|g" /app/templates/default.conf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|#ssl_trusted_certificate .*|ssl_trusted_certificate "$NPM_CHAIN";|g" /app/templates/default.conf; fi

if [ "$NPM_LISTEN_LOCALHOST" == "true" ]; then
sed -i "s/listen 81/listen 127.0.0.1:81/g" /usr/local/nginx/conf/conf.d/npm.conf || sleep inf
sed -i "s/listen \[::\]:81/listen \[::1\]:81/g" /usr/local/nginx/conf/conf.d/npm.conf || sleep inf
fi

if [ "$NGINX_LOG_NOT_FOUND" == "true" ]; then
sed -i "s/log_not_found off;/log_not_found on;/g" /usr/local/nginx/conf/nginx.conf || sleep inf
fi

if [ -z "$NPM_CERT_ID" ]; then
    if [ ! -f /data/tls/dummycert.pem ] || [ ! -f /data/tls/dummykey.pem ]; then
        openssl req -new -newkey rsa:4096 -days 365000 -nodes -x509 -subj '/CN=*' -sha256 -keyout /data/tls/dummykey.pem -out /data/tls/dummycert.pem || sleep inf
    fi
else 
    rm -vrf /data/tls/dummycert.pem \
            /data/tls/dummykey.pem
fi

if [ ! -f /data/nginx/default.conf ]; then
mv -vn /usr/local/nginx/conf/conf.d/include/default.conf /data/nginx/default.conf || sleep inf
fi

if [ ! -f /data/tls/certbot/config.ini ]; then
mv -vn /etc/tls/certbot.ini /data/tls/certbot/config.ini || sleep inf
fi

sed -i "s|ssl_certificate .*|ssl_certificate "$NPM_CERT";|g" /data/nginx/default.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key "$NPM_KEY";|g" /data/nginx/default.conf
if [ -n "$NPM_CHAIN" ]; then sed -i "s|ssl_trusted_certificate .*|ssl_trusted_certificate "$NPM_CHAIN";|g" /data/nginx/default.conf; fi

if ! nginx -t &> /dev/null; then
nginx -T || sleep inf
sleep inf || exit 1
fi

if ! cross-env PHP_INI_SCAN_DIR=/data/php/81/conf.d php-fpm81 -c /data/php/81 -y /data/php/81/php-fpm.conf -FORt &> /dev/null; then
cross-env PHP_INI_SCAN_DIR=/data/php/81/conf.d php-fpm81 -c /data/php/81 -y /data/php/81/php-fpm.conf -FORt || sleep inf
sleep inf || exit 1
fi

if ! cross-env PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FORt &> /dev/null; then
cross-env PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FORt || sleep inf
sleep inf || exit 1
fi

while (nginx -t &> /dev/null && cross-env PHP_INI_SCAN_DIR=/data/php/81/conf.d php-fpm81 -c /data/php/81 -y /data/php/81/php-fpm.conf -FORt &> /dev/null && cross-env PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FORt &> /dev/null); do
nginx || exit 1 &
cross-env PHP_INI_SCAN_DIR=/data/php/81/conf.d php-fpm81 -c /data/php/81 -y /data/php/81/php-fpm.conf -FOR || exit 1 &
cross-env PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FOR || exit 1 &
node --abort_on_uncaught_exception --max_old_space_size=250 index.js || exit 1 &
wait
done

if ! nginx -t &> /dev/null; then
nginx -T || exit 1
fi

if ! cross-env PHP_INI_SCAN_DIR=/data/php/81/conf.d php-fpm81 -c /data/php/81 -y /data/php/81/php-fpm.conf -FORt &> /dev/null; then
cross-env PHP_INI_SCAN_DIR=/data/php/81/conf.d php-fpm81 -c /data/php/81 -y /data/php/81/php-fpm.conf -FORt || exit 1
fi

if ! cross-env PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FORt &> /dev/null; then
cross-env PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FORt || exit 1
fi
