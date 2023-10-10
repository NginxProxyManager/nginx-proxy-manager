FROM --platform="$BUILDPLATFORM" alpine:3.18.4 as frontend
COPY frontend                        /build/frontend
COPY global/certbot-dns-plugins.js   /build/frontend/certbot-dns-plugins.js
ARG NODE_ENV=production \
    NODE_OPTIONS=--openssl-legacy-provider
WORKDIR /build/frontend
RUN apk add --no-cache ca-certificates nodejs yarn git python3 build-base && \
    yarn --no-lockfile install && \
    yarn --no-lockfile build && \
    yarn cache clean --all
COPY darkmode.css /build/frontend/dist/css/darkmode.css
COPY security.txt /build/frontend/dist/.well-known/security.txt


FROM --platform="$BUILDPLATFORM" alpine:3.18.4 as backend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
COPY backend                        /build/backend
COPY global/certbot-dns-plugins.js  /build/backend/certbot-dns-plugins.js
ARG NODE_ENV=production \
    TARGETARCH
WORKDIR /build/backend
RUN apk add --no-cache ca-certificates nodejs-current yarn && \
    wget -q https://gobinaries.com/tj/node-prune -O - | sh && \
    if [ "$TARGETARCH" = "amd64" ]; then \
    npm_config_target_platform=linux npm_config_target_arch=x64 yarn install --no-lockfile; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
    npm_config_target_platform=linux npm_config_target_arch=arm64 yarn install --no-lockfile; \
    fi && \
    node-prune && \
    yarn cache clean --all


FROM python:3.12.0-alpine3.18 as certbot
ENV PATH="/usr/local/certbot/bin:$PATH"
RUN apk add --no-cache ca-certificates build-base libffi-dev && \
    python3 -m venv /usr/local/certbot && \
    pip install --no-cache-dir certbot


FROM --platform="$BUILDPLATFORM" alpine:3.18.4 as crowdsec
WORKDIR /src
RUN apk add --no-cache ca-certificates git build-base && \
    git clone --recursive https://github.com/crowdsecurity/cs-nginx-bouncer /src && \
    make && \
    tar xzf crowdsec-nginx-bouncer.tgz && \
    mv crowdsec-nginx-bouncer-* crowdsec-nginx-bouncer && \
    sed -i "/lua_package_path/d" /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i "s|/etc/crowdsec/bouncers/crowdsec-nginx-bouncer.conf|/data/etc/crowdsec/crowdsec.conf|g" /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i "s|API_KEY=.*|API_KEY=|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|ENABLED=.*|ENABLED=false|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|API_URL=.*|API_URL=http://127.0.0.1:8080|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|BAN_TEMPLATE_PATH=.*|BAN_TEMPLATE_PATH=/data/etc/crowdsec/ban.html|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|CAPTCHA_TEMPLATE_PATH=.*|CAPTCHA_TEMPLATE_PATH=/data/etc/crowdsec/captcha.html|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf


FROM zoeyvid/nginx-quic:206
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
COPY rootfs /
RUN apk add --no-cache ca-certificates tzdata tini \
    lua5.1-lzlib \
    nodejs-current \
    openssl apache2-utils \
    coreutils grep jq curl shadow sudo \
    luarocks5.1 wget lua5.1-dev build-base git yarn && \
    wget -q https://raw.githubusercontent.com/SpiderLabs/ModSecurity/v3/master/modsecurity.conf-recommended -O /usr/local/nginx/conf/conf.d/include/modsecurity.conf && \
    wget -q https://raw.githubusercontent.com/SpiderLabs/ModSecurity/v3/master/unicode.mapping -O /usr/local/nginx/conf/conf.d/include/unicode.mapping && \
    sed -i "s|SecRuleEngine .*|SecRuleEngine On|g" /usr/local/nginx/conf/conf.d/include/modsecurity.conf && \
    echo "Include /data/etc/modsecurity/modsecurity.conf" | tee -a /usr/local/nginx/conf/conf.d/include/modsecurity.conf && \
    cp /usr/local/nginx/conf/conf.d/include/modsecurity.conf /usr/local/nginx/conf/conf.d/include/modsecurity-crs.conf && \
    echo "Include /data/etc/modsecurity/crs-setup.conf" | tee -a /usr/local/nginx/conf/conf.d/include/modsecurity-crs.conf && \
    echo "Include /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf" | tee -a /usr/local/nginx/conf/conf.d/include/modsecurity-crs.conf && \
    echo "#Include /usr/local/nginx/conf/conf.d/include/coreruleset/plugins/*-config.conf" | tee -a /usr/local/nginx/conf/conf.d/include/modsecurity-crs.conf && \
    echo "#Include /usr/local/nginx/conf/conf.d/include/coreruleset/plugins/*-before.conf" | tee -a /usr/local/nginx/conf/conf.d/include/modsecurity-crs.conf && \
    echo "Include /usr/local/nginx/conf/conf.d/include/coreruleset/rules/*.conf" | tee -a /usr/local/nginx/conf/conf.d/include/modsecurity-crs.conf && \
    echo "#Include /usr/local/nginx/conf/conf.d/include/coreruleset/plugins/*-after.conf" | tee -a /usr/local/nginx/conf/conf.d/include/modsecurity-crs.conf && \
    git clone https://github.com/coreruleset/coreruleset /tmp/coreruleset && \
    mkdir /usr/local/nginx/conf/conf.d/include/coreruleset && \
    cp /tmp/coreruleset/crs-setup.conf.example /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example && \
    sed -i '/#/!d' /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example && \
    mv /tmp/coreruleset/crs-setup.conf.example /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf && \
    mv /tmp/coreruleset/rules /usr/local/nginx/conf/conf.d/include/coreruleset/rules && \
    #git clone --recursive https://github.com/coreruleset/phpmyadmin-rule-exclusions-plugin /tmp/phpmyadmin-rule-exclusions-plugin && \
    #git clone --recursive https://github.com/coreruleset/nextcloud-rule-exclusions-plugin /tmp/nextcloud-rule-exclusions-plugin && \
    #git clone --recursive https://github.com/coreruleset/wordpress-rule-exclusions-plugin /tmp/wordpress-rule-exclusions-plugin && \
    #git clone --recursive https://github.com/coreruleset/cpanel-rule-exclusions-plugin /tmp/cpanel-rule-exclusions-plugin && \
    #git clone --recursive https://github.com/coreruleset/body-decompress-plugin /tmp/body-decompress-plugin && \
    #git clone --recursive https://github.com/coreruleset/auto-decoding-plugin /tmp/auto-decoding-plugin && \
    #git clone --recursive https://github.com/coreruleset/google-oauth2-plugin /tmp/google-oauth2-plugin && \
    mv /tmp/coreruleset/plugins /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    #mv /tmp/phpmyadmin-rule-exclusions-plugin/plugins/* /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    #mv /tmp/nextcloud-rule-exclusions-plugin/plugins/* /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    #mv /tmp/wordpress-rule-exclusions-plugin/plugins/* /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    #mv /tmp/cpanel-rule-exclusions-plugin/plugins/* /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    #mv /tmp/body-decompress-plugin/plugins/* /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    #mv /tmp/auto-decoding-plugin/plugins/* /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    #mv /tmp/google-oauth2-plugin/plugins/* /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    rm -r /tmp/* && \
    luarocks-5.1 install lua-resty-http && \
    luarocks-5.1 install lua-cjson && \
    yarn global add nginxbeautifier && \
    apk del --no-cache luarocks5.1 wget lua5.1-dev build-base git yarn

COPY --from=backend  /build/backend                                             /app
COPY --from=frontend /build/frontend/dist                                       /app/frontend
COPY --from=certbot  /usr/local/certbot                                         /usr/local/certbot
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/lib/plugins            /usr/local/nginx/lib/lua/plugins
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/lib/crowdsec.lua       /usr/local/nginx/lib/lua/crowdsec.lua
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/templates/ban.html     /usr/local/nginx/conf/conf.d/include/ban.html
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/templates/captcha.html /usr/local/nginx/conf/conf.d/include/captcha.html
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf    /usr/local/nginx/conf/conf.d/include/crowdsec.conf
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf      /usr/local/nginx/conf/conf.d/include/crowdsec_nginx.conf

RUN ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js && \
    ln -s /app/index.js /usr/local/bin/index.js

ENV NODE_ENV=production \
    NODE_CONFIG_DIR=/data/etc/npm \
    PATH="/usr/local/certbot/bin:$PATH" \
    DB_SQLITE_FILE=/data/etc/npm/database.sqlite

ENV PUID=0 \
    PGID=0 \
    NIBEP=48693 \
    NPM_PORT=81 \
    IPV4_BINDING=0.0.0.0 \
    NPM_IPV4_BINDING=0.0.0.0 \
    IPV6_BINDING=[::] \
    NPM_IPV6_BINDING=[::] \
    DISABLE_IPV6=false \
    NPM_DISABLE_IPV6=false \
    NPM_LISTEN_LOCALHOST=false \
    NPM_CERT_ID=0 \
    DISABLE_HTTP=false \
    NGINX_LOG_NOT_FOUND=false \
    CLEAN=true \
    FULLCLEAN=false \
    PHP81=false \
    PHP82=false

WORKDIR /app
ENTRYPOINT ["tini", "--", "start.sh"]
HEALTHCHECK CMD healthcheck.sh
