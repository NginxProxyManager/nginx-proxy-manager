#!/usr/bin/env sh

if [ "$ACME_KEY_TYPE" = "rsa" ]; then
    sed -i "s|key-type = ecdsa|key-type = rsa|g" /etc/certbot.ini
fi
if [ "$ACME_MUST_STAPLE" = "false" ]; then
    sed -i "s|must-staple = true|must-staple = false|g" /etc/certbot.ini
fi
if [ "$ACME_SERVER_TLS_VERIFY" = "false" ]; then
    sed -i "s|no-verify-ssl = false|no-verify-ssl = true|g" /etc/certbot.ini
fi
if [ "$ACME_PROFILE" != "none" ]; then
    sed -i "s|#required-profile|required-profile = $ACME_PROFILE|g" /etc/certbot.ini
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
fi

if [ "$PHP85" = "true" ]; then
    apk add --no-cache php85-fpm
    # From https://github.com/nextcloud/all-in-one/pull/1377/files
    if [ -n "$PHP85_APKS" ]; then
        for apk in $(echo "$PHP85_APKS" | tr " " "\n"); do
            if ! echo "$apk" | grep -q "^php85-.*$"; then
                echo "$apk is a non allowed value."
                echo "It needs to start with \"php85-\"."
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
    cp -varnT /etc/php85 /data/php/85
    sed -i "s|#\?listen =.*|listen = /run/php85.sock|" /data/php/85/php-fpm.d/www.conf
    sed -i "s|;error_log =.*|error_log = /proc/self/fd/2|g" /data/php/85/php-fpm.conf
    sed -i "s|include=.*|include=/data/php/85/php-fpm.d/*.conf|g" /data/php/85/php-fpm.conf
fi

if { [ "$PHP83" = "true" ] || [ "$PHP84" = "true" ] || [ "$PHP85" = "true" ]; } && [ -n "$PHP_APKS" ]; then
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


mkdir -p /tmp/npmhome \
         /tmp/goa \
         /tmp/certbot-log \
         /tmp/certbot-work \
         /tmp/certbot-credentials
mkdir -vp /data/npmplus/gravatar \
          /data/tls/certbot/renewal \
          /data/tls/certbot/acme-challenge \
          /data/tls/custom \
          /data/html \
          /data/access \
          /data/crowdsec \
          /data/nginx/redirection_host \
          /data/nginx/proxy_host \
          /data/nginx/dead_host \
          /data/nginx/stream \
          /data/nginx/logs \
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

#tmp
if [ -s /data/database.sqlite ]; then
    mv -vn /data/database.sqlite /data/npmplus/database.sqlite
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


if mountpoint -q /etc/letsencrypt; then
    cp -van /etc/letsencrypt/* /data/tls/certbot
    echo "All certbot certs have been copied, please remove the /etc/letsencrypt mountpoint and redeploy to continue the migration!"
    sleep inf
fi

#tmp move to mointpoint if block
find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/etc/letsencrypt|/data/tls/certbot|g" {} \;
find /data/tls/certbot/renewal -type f -name '*.conf' -exec sed -i "s|/data/tls/certbot/credentials|/tmp/certbot-credentials|g" {} \;

if [ -d /data/tls/certbot/live ] && [ -d /data/tls/certbot/archive ]; then
  find /data/tls/certbot/live ! -name "$(printf "*\n*")" -type f -name "*.pem" > /tmp/certs.txt
  while IFS= read -r cert
  do
    rm -vf "$cert"
    ln -rs "$(find /data/tls/certbot/archive/"$(echo "$cert" | sed "s|/data/tls/certbot/live/\(npm-[0-9]\+/.*\).pem|\1|g")"*.pem | sort -V | tail -n1 | sed "s|/data/tls/certbot/|../../|g")" "$cert"
  done < /tmp/certs.txt
  rm /tmp/certs.txt
fi

rm -vrf /data/tls/certbot/crs
rm -vrf /data/tls/certbot/keys
if [ -d /data/tls/certbot/live ] && [ -d /data/tls/certbot/archive ]; then
    certs_in_use="$(find /data/tls/certbot/live -type l -name "*.pem" -exec readlink -f {} \;)"
    find /data/tls/certbot/archive ! -name "$(printf "*\n*")" -type f -name "*.pem" > tmp
    while IFS= read -r archive
    do
        if ! echo "$certs_in_use" | grep -q "$archive"; then
          rm -vf "$archive"
        fi
    done < tmp
    rm tmp
fi

# can be used to delete certificates which expired more than 16 weeks ago
#for cert in $(find /data/tls/certbot/live/npm-* -type d | sed "s|/data/tls/certbot/live/||g"); do
#    if ! openssl x509 -in "/data/tls/certbot/live/$cert/fullchain.pem" -checkend -9676800 >/dev/null; then
#        rm -rvf "/data/tls/certbot/live/$cert"
#        rm -rvf "/data/tls/certbot/live/$cert.der"
#        rm -rvf "/data/tls/certbot/archive/$cert"
#        rm -rvf "/data/tls/certbot/renewal/$cert.conf"
#    fi
#done

rm -vrf /data/letsencrypt-acme-challenge \
        /data/nginx/default_host \
        /data/nginx/temp \
        /data/logs

touch /data/html/index.html \
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


if [ ! -s /data/crowdsec/ban.html ]; then
    cp -van /etc/ban.html.original /data/crowdsec/ban.html
fi
cp -a /etc/ban.html.original /data/crowdsec/ban.html.example

if [ ! -s /data/crowdsec/captcha.html ]; then
    cp -van /etc/captcha.html.original /data/crowdsec/captcha.html
fi
cp -a /etc/captcha.html.original /data/crowdsec/captcha.html.example

if [ ! -s /data/crowdsec/crowdsec.conf ]; then
    cp -van /etc/crowdsec.conf.example /data/crowdsec/crowdsec.conf
fi
cp -a /etc/crowdsec.conf.example /data/crowdsec/crowdsec.conf.example

if grep -iq "^ENABLED *= *true$" /data/crowdsec/crowdsec.conf; then
    if [ ! -s /usr/local/nginx/conf/conf.d/crowdsec.conf ]; then
        cp -van /usr/local/nginx/conf/conf.d/crowdsec.conf.disabled /usr/local/nginx/conf/conf.d/crowdsec.conf
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

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/npmplus.conf
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/npmplus.conf
if [ -s "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|#\?ssl_stapling|ssl_stapling|g" /usr/local/nginx/conf/conf.d/npmplus.conf
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/npmplus.conf
fi

sed -i "s|ssl_certificate .*|ssl_certificate $DEFAULT_CERT;|g" /usr/local/nginx/conf/conf.d/goaccess.conf.disabled
sed -i "s|ssl_certificate_key .*|ssl_certificate_key $DEFAULT_KEY;|g" /usr/local/nginx/conf/conf.d/goaccess.conf.disabled
if [ -s "$DEFAULT_STAPLING_FILE" ]; then
    sed -i "s|#\?ssl_stapling|ssl_stapling|g" /usr/local/nginx/conf/conf.d/goaccess.conf.disabled
    sed -i "s|#\?ssl_stapling_file .*|ssl_stapling_file $DEFAULT_STAPLING_FILE;|g" /usr/local/nginx/conf/conf.d/goaccess.conf.disabled
fi

sed -i "s|#\?listen 0.0.0.0:81 |listen $NPM_IPV4_BINDING:$NPM_PORT |g" /usr/local/nginx/conf/conf.d/npmplus.conf
sed -i "s|#\?listen 0.0.0.0:91 |listen $GOA_IPV4_BINDING:$GOA_PORT |g" /usr/local/nginx/conf/conf.d/goaccess.conf.disabled

if [ "$DISABLE_IPV6" = "true" ]; then
    sed -i "s|ipv6=on;|ipv6=off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|#\?listen \[::\]:81 |#listen $NPM_IPV6_BINDING:$NPM_PORT |g" /usr/local/nginx/conf/conf.d/npmplus.conf
    sed -i "s|#\?listen \[::\]:91 |#listen $GOA_IPV6_BINDING:$GOA_PORT |g" /usr/local/nginx/conf/conf.d/goaccess.conf.disabled
else
    sed -i "s|#\?listen \[::\]:81 |listen $NPM_IPV6_BINDING:$NPM_PORT |g" /usr/local/nginx/conf/conf.d/npmplus.conf
    sed -i "s|#\?listen \[::\]:91 |listen $GOA_IPV6_BINDING:$GOA_PORT |g" /usr/local/nginx/conf/conf.d/goaccess.conf.disabled
fi

if [ "$GOA" = "true" ]; then
    mkdir -vp /data/goaccess/data /data/goaccess/geoip
    cp -van /usr/local/nginx/conf/conf.d/goaccess.conf.disabled /usr/local/nginx/conf/conf.d/goaccess.conf
fi

if [ "$LISTEN_PROXY_PROTOCOL" = "true" ]; then
  sed -i "s|real_ip_header.*|real_ip_header proxy_protocol;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_QUIC_BPF" = "true" ]; then
  sed -i "s|quic_bpf.*|quic_bpf on;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOG_NOT_FOUND" = "true" ]; then
    sed -i "s|log_not_found.*|log_not_found on;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_WORKER_PROCESSES" != "auto" ]; then
    sed -i "s|worker_processes.*|worker_processes $NGINX_WORKER_PROCESSES;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_WORKER_CONNECTIONS" != "512" ]; then
    sed -i "s|worker_connections.*|worker_connections $NGINX_WORKER_CONNECTIONS;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$X_FRAME_OPTIONS" = "deny" ]; then
    sed -i "s|SAMEORIGIN|DENY|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$X_FRAME_OPTIONS" = "none" ]; then
    sed -i "s|#\?\(.*SAMEORIGIN\)|#\1|g" /usr/local/nginx/conf/nginx.conf
fi

if [ "$NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE" = "true" ]; then
    sed -i "s|#\(load_module.\+libngx_module.so;\)|\1|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|brotli on;|brotli off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|unbrotli on;|unbrotli off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|brotli_static on;|brotli_static off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|zstd on;|zstd off;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|zstd_static on;|zstd_static off;|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOAD_GEOIP_MODULE" = "true" ]; then
    sed -i "s|#\(load_module.\+geoip_module.so;\)|\1|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOAD_GEOIP2_MODULE" = "true" ]; then
    sed -i "s|#\(load_module.\+geoip2_module.so;\)|\1|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOAD_LDAP_MODULE" = "true" ]; then
    sed -i "s|#\(load_module.\+ngx_http_auth_ldap_module.so;\)|\1|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOAD_NTLM_MODULE" = "true" ]; then
    sed -i "s|#\(load_module.\+ngx_http_upstream_ntlm_module.so;\)|\1|g" /usr/local/nginx/conf/nginx.conf
fi
if [ "$NGINX_LOAD_VHOST_TRAFFIC_STATUS_MODULE" = "true" ]; then
    sed -i "s|#\(load_module.\+ngx_http_vhost_traffic_status_module.so;\)|\1|g" /usr/local/nginx/conf/nginx.conf
fi

if [ "$REGENERATE_ALL" = "true" ]; then
    find /data/nginx -name "*.conf" -delete
fi

if [ "$LOGROTATE" = "true" ]; then
    sed -i "s|rotate [0-9]\+|rotate $LOGROTATIONS|g" /etc/logrotate
    sed -i "s|access_log off; # http|access_log /data/nginx/logs/access.log alog;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|access_log off; # stream|access_log /data/nginx/logs/stream.log slog;|g" /usr/local/nginx/conf/nginx.conf
    sed -i "s|#error_log|error_log|g" /usr/local/nginx/conf/nginx.conf

    if [ ! -L /data/nginx/access.log ] && [ ! -f /data/nginx/logs/access.log ]; then mv -vn /data/nginx/access.log* /data/nginx/logs; fi
    if [ ! -L /data/nginx/stream.log ] && [ ! -f /data/nginx/logs/stream.log ]; then mv -vn /data/nginx/stream.log* /data/nginx/logs; fi
    if [ ! -L /data/nginx/error.log ] && [ ! -f /data/nginx/logs/error.log ]; then mv -vn /data/nginx/error.log* /data/nginx/logs; fi
    if [ -f /data/logrotate.state ]; then mv -vn /data/logrotate.state /data/nginx/logs/logrotate.state; fi

    touch /data/nginx/logs/access.log \
          /data/nginx/logs/stream.log \
          /data/nginx/logs/error.log

    if [ ! -L /data/nginx/access.log ]; then rm -f /data/nginx/access.log; ln -rs /data/nginx/logs/access.log /data/nginx/access.log; fi
    if [ ! -L /data/nginx/stream.log ]; then rm -f /data/nginx/stream.log; ln -rs /data/nginx/logs/stream.log /data/nginx/stream.log; fi
    if [ ! -L /data/nginx/error.log ]; then rm -f /data/nginx/error.log; ln -rs /data/nginx/logs/error.log /data/nginx/error.log; fi
    rm -f /data/logrotate.state
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
    find /usr/local \
         /data \
         /run \
         /tmp \
         -not \( -uid "$PUID" -and -gid "$PGID" \) \
         -exec chown "$PUID:$PGID" {} \;
    chown "$PUID:$PGID" /proc/self/fd/2
    if [ "$PHP83" = "true" ]; then
        sed -i "s|;\?user =.*|;user = root|" /data/php/83/php-fpm.d/www.conf
        sed -i "s|;\?group =.*|;group = root|" /data/php/83/php-fpm.d/www.conf
    fi
    if [ "$PHP84" = "true" ]; then
        sed -i "s|;\?user =.*|;user = root|" /data/php/84/php-fpm.d/www.conf
        sed -i "s|;\?group =.*|;group = root|" /data/php/84/php-fpm.d/www.conf
    fi
    if [ "$PHP85" = "true" ]; then
        sed -i "s|;\?user =.*|;user = root|" /data/php/85/php-fpm.d/www.conf
        sed -i "s|;\?group =.*|;group = root|" /data/php/85/php-fpm.d/www.conf
    fi
    sed -i "s|user root;|#user root;|g" /usr/local/nginx/conf/nginx.conf
    exec su-exec "$PUID:$PGID" launch.sh
else
    find /data -not \( -uid 0 -and -gid 0 \) -exec chown 0:0 {} \;
    if [ "$PHP83" = "true" ]; then
        sed -i "s|;user =.*|user = root|" /data/php/83/php-fpm.d/www.conf
        sed -i "s|;group =.*|group = root|" /data/php/83/php-fpm.d/www.conf
    fi
    if [ "$PHP84" = "true" ]; then
        sed -i "s|;user =.*|user = root|" /data/php/84/php-fpm.d/www.conf
        sed -i "s|;group =.*|group = root|" /data/php/84/php-fpm.d/www.conf
    fi
    if [ "$PHP85" = "true" ]; then
        sed -i "s|;user =.*|user = root|" /data/php/85/php-fpm.d/www.conf
        sed -i "s|;group =.*|group = root|" /data/php/85/php-fpm.d/www.conf
    fi
    sed -i "s|#user root;|user root;|g"  /usr/local/nginx/conf/nginx.conf
    exec launch.sh
fi
