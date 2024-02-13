# syntax=docker/dockerfile:labs
FROM --platform="$BUILDPLATFORM" alpine:3.19.1 as frontend
COPY frontend                        /build/frontend
COPY global/certbot-dns-plugins.json /build/frontend/certbot-dns-plugins.json
ARG NODE_ENV=production \
    NODE_OPTIONS=--openssl-legacy-provider
WORKDIR /build/frontend
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates nodejs yarn git python3 build-base && \
    yarn --no-lockfile install && \
    yarn --no-lockfile build && \
    yarn cache clean --all
COPY darkmode.css /build/frontend/dist/css/darkmode.css
COPY security.txt /build/frontend/dist/.well-known/security.txt


FROM --platform="$BUILDPLATFORM" alpine:3.19.1 as backend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
COPY backend                         /build/backend
COPY global/certbot-dns-plugins.json /build/backend/certbot-dns-plugins.json
ARG NODE_ENV=production \
    TARGETARCH
WORKDIR /build/backend
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates nodejs-current yarn && \
    wget -q https://gobinaries.com/tj/node-prune -O - | sh && \
    if [ "$TARGETARCH" = "amd64" ]; then \
    npm_config_target_platform=linux npm_config_target_arch=x64 yarn install --no-lockfile; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
    npm_config_target_platform=linux npm_config_target_arch=arm64 yarn install --no-lockfile; \
    fi && \
    node-prune && \
    yarn cache clean --all


FROM --platform="$BUILDPLATFORM" alpine:3.19.1 as crowdsec
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]

ARG CSNB_VER=v1.0.7

WORKDIR /src
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates git build-base && \
    git clone --recursive https://github.com/crowdsecurity/cs-nginx-bouncer --branch "$CSNB_VER" /src && \
    make && \
    tar xzf crowdsec-nginx-bouncer.tgz && \
    mv crowdsec-nginx-bouncer-* crowdsec-nginx-bouncer && \
    sed -i "/lua_package_path/d" /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i "s|/etc/crowdsec/bouncers/crowdsec-nginx-bouncer.conf|/data/etc/crowdsec/crowdsec.conf|g" /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i "s|API_KEY=.*|API_KEY=|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|ENABLED=.*|ENABLED=false|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|API_URL=.*|API_URL=http://127.0.0.1:8080|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|BAN_TEMPLATE_PATH=.*|BAN_TEMPLATE_PATH=/data/etc/crowdsec/ban.html|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|CAPTCHA_TEMPLATE_PATH=.*|CAPTCHA_TEMPLATE_PATH=/data/etc/crowdsec/captcha.html|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    echo "#APPSEC_URL=http://127.0.0.1:7422 # see https://github.com/crowdsecurity/lua-cs-bouncer/issues/63" | tee -a /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    echo "#APPSEC_FAILURE_ACTION=deny # see https://github.com/crowdsecurity/lua-cs-bouncer/issues/63" | tee -a /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|BOUNCING_ON_TYPE=all|BOUNCING_ON_TYPE=ban|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf

FROM zoeyvid/nginx-quic:260
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]

ARG CRS_VER=v4.0.0

COPY rootfs /
COPY --from=zoeyvid/certbot-docker:25  /usr/local          /usr/local
COPY --from=zoeyvid/curl-quic:370      /usr/local/bin/curl /usr/local/bin/curl

RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates tzdata tini \
    patch bash nano \
    nodejs-current \
    openssl apache2-utils \
    lua5.1-lzlib lua5.1-socket \
    coreutils grep jq shadow sudo \
    luarocks5.1 wget lua5.1-dev build-base git yarn && \
    curl https://raw.githubusercontent.com/acmesh-official/acme.sh/master/acme.sh | sh -s -- --install-online --home /usr/local/acme.sh --nocron && \
    git clone https://github.com/coreruleset/coreruleset --branch "$CRS_VER" /tmp/coreruleset && \
    mkdir -v /usr/local/nginx/conf/conf.d/include/coreruleset && \
    mv -v /tmp/coreruleset/crs-setup.conf.example /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example && \
    mv -v /tmp/coreruleset/plugins /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    mv -v /tmp/coreruleset/rules /usr/local/nginx/conf/conf.d/include/coreruleset/rules && \
    rm -r /tmp/* && \
    luarocks-5.1 install lua-resty-http && \
    luarocks-5.1 install lua-cjson && \
    yarn global add nginxbeautifier && \
    apk del --no-cache luarocks5.1 wget lua5.1-dev build-base git yarn

COPY --from=backend                    /build/backend                                             /app
COPY --from=frontend                   /build/frontend/dist                                       /html/frontend
COPY --from=crowdsec                   /src/crowdsec-nginx-bouncer/lua-mod/lib/plugins            /usr/local/nginx/lib/lua/plugins
COPY --from=crowdsec                   /src/crowdsec-nginx-bouncer/lua-mod/lib/crowdsec.lua       /usr/local/nginx/lib/lua/crowdsec.lua
COPY --from=crowdsec                   /src/crowdsec-nginx-bouncer/lua-mod/templates/ban.html     /usr/local/nginx/conf/conf.d/include/ban.html
COPY --from=crowdsec                   /src/crowdsec-nginx-bouncer/lua-mod/templates/captcha.html /usr/local/nginx/conf/conf.d/include/captcha.html
COPY --from=crowdsec                   /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf    /usr/local/nginx/conf/conf.d/include/crowdsec.conf
COPY --from=crowdsec                   /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf      /usr/local/nginx/conf/conf.d/include/crowdsec_nginx.conf

RUN ln -s /usr/local/acme.sh/acme.sh /usr/local/bin/acme.sh && \
    ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js && \
    ln -s /app/index.js /usr/local/bin/index.js

ENV NODE_ENV=production \
    NODE_CONFIG_DIR=/data/etc/npm \
    DB_SQLITE_FILE=/data/etc/npm/database.sqlite

ENV PUID=0 \
    PGID=0 \
    NIBEP=48693 \
    GOAIWSP=48683 \
    NPM_PORT=81 \
    GOA_PORT=91 \
    IPV4_BINDING=0.0.0.0 \
    NPM_IPV4_BINDING=0.0.0.0 \
    GOA_IPV4_BINDING=0.0.0.0 \
    IPV6_BINDING=[::] \
    NPM_IPV6_BINDING=[::] \
    GOA_IPV6_BINDING=[::] \
    DISABLE_IPV6=false \
    NPM_DISABLE_IPV6=false \
    GOA_DISABLE_IPV6=false \
    NPM_LISTEN_LOCALHOST=false \
    GOA_LISTEN_LOCALHOST=false \
    DEFAULT_CERT_ID=0 \
    DISABLE_HTTP=false \
    NGINX_ACCESS_LOG=false \
    NGINX_LOG_NOT_FOUND=false \
    CLEAN=true \
    FULLCLEAN=false \
    SKIP_IP_RANGES=false \
    LOGROTATE=false \
    LOGROTATIONS=3 \
    GOA=false \
    GOACLA="--agent-list --real-os --double-decode --anonymize-ip --anonymize-level=1 --keep-last=30 --with-output-resolver --no-query-string" \
    PHP81=false \
    PHP82=false \
    PHP83=false

WORKDIR /app
ENTRYPOINT ["tini", "--", "entrypoint.sh"]
HEALTHCHECK CMD healthcheck.sh
