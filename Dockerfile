# syntax=docker/dockerfile:labs
FROM --platform="$BUILDPLATFORM" alpine:3.21.0 AS frontend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production \
    NODE_OPTIONS=--openssl-legacy-provider
COPY frontend                        /app
COPY global/certbot-dns-plugins.json /app/certbot-dns-plugins.json
WORKDIR /app/frontend
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates nodejs yarn git python3 py3-pip build-base file && \
    yarn global add clean-modules && \
    pip install setuptools --no-cache-dir --break-system-packages && \
    yarn --no-lockfile install && \
    yarn --no-lockfile build && \
    yarn cache clean --all && \
    clean-modules --yes && \
    find /app/dist -name "*.node" -type f -exec file {} \;
COPY darkmode.css /app/dist/css/darkmode.css
COPY security.txt /app/dist/.well-known/security.txt


FROM --platform="$BUILDPLATFORM" alpine:3.21.0 AS build-backend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production \
    TARGETARCH
COPY backend                         /app
COPY global/certbot-dns-plugins.json /app/certbot-dns-plugins.json
WORKDIR /app
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates nodejs yarn file && \
    yarn global add clean-modules && \
    if [ "$TARGETARCH" = "amd64" ]; then \
     npm_config_arch=x64 npm_config_target_arch=x64 yarn install --no-lockfile && \
      for file in $(find /app/node_modules -name "*.node" -type f -exec file {} \; | grep -v "x86-64\|x86_64" | grep "aarch64\|arm64" | sed "s|\([^:]\):.*|\1|g"); do rm -v "$file"; done; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
      npm_config_arch=arm64 npm_config_target_arch=arm64 yarn install --no-lockfile && \
      for file in $(find /app/node_modules -name "*.node" -type f -exec file {} \; | grep -v "aarch64\|arm64" | grep "x86-64\|x86_64" | sed "s|\([^:]\):.*|\1|g"); do rm -v "$file"; done; \
    fi && \
    yarn cache clean --all && \
    clean-modules --yes
FROM alpine:3.21.0 AS strip-backend
COPY --from=build-backend /app /app
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates binutils file && \
    find /app/node_modules -name "*.node" -type f -exec strip -s {} \; && \
    find /app/node_modules -name "*.node" -type f -exec file {} \;


FROM --platform="$BUILDPLATFORM" alpine:3.21.0 AS crowdsec
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG CSNB_VER=v1.0.8
WORKDIR /src
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates git build-base && \
    git clone --recursive https://github.com/crowdsecurity/cs-nginx-bouncer --branch "$CSNB_VER" /src && \
    make && \
    tar xzf crowdsec-nginx-bouncer.tgz && \
    mv crowdsec-nginx-bouncer-* crowdsec-nginx-bouncer && \
    sed -i "/lua_package_path/d" /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i "s|/etc/crowdsec/bouncers/crowdsec-nginx-bouncer.conf|/data/etc/crowdsec/crowdsec.conf|g" /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i "s|crowdsec-nginx-bouncer|crowdsec-npmplus-bouncer|g" /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i "s|API_KEY=.*|API_KEY=|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|ENABLED=.*|ENABLED=false|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|API_URL=.*|API_URL=http://127.0.0.1:8080|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|BAN_TEMPLATE_PATH=.*|BAN_TEMPLATE_PATH=/data/etc/crowdsec/ban.html|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|CAPTCHA_TEMPLATE_PATH=.*|CAPTCHA_TEMPLATE_PATH=/data/etc/crowdsec/captcha.html|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|APPSEC_URL=.*|APPSEC_URL=http://127.0.0.1:7422|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|APPSEC_FAILURE_ACTION=.*|APPSEC_FAILURE_ACTION=deny|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|REQUEST_TIMEOUT=.*|REQUEST_TIMEOUT=2500|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|APPSEC_CONNECT_TIMEOUT=.*|APPSEC_CONNECT_TIMEOUT=1000|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|APPSEC_SEND_TIMEOUT=.*|APPSEC_SEND_TIMEOUT=30000|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|APPSEC_PROCESS_TIMEOUT=.*|APPSEC_PROCESS_TIMEOUT=10000|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf


FROM zoeyvid/nginx-quic:368-python
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG CRS_VER=v4.9.0
COPY rootfs /
COPY --from=strip-backend /app /app

RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates tzdata tini curl \
    nodejs \
    bash nano \
    logrotate goaccess fcgi \
    lua5.1-lzlib lua5.1-socket \
    coreutils grep findutils jq shadow su-exec \
    luarocks5.1 lua5.1-dev lua5.1-sec build-base git yarn && \
#    curl https://raw.githubusercontent.com/acmesh-official/acme.sh/master/acme.sh | sh -s -- --install-online --home /usr/local/acme.sh --nocron && \
#    ln -s /usr/local/acme.sh/acme.sh /usr/local/bin/acme.sh && \
    curl https://raw.githubusercontent.com/tomwassenberg/certbot-ocsp-fetcher/refs/heads/main/certbot-ocsp-fetcher -o /usr/local/bin/certbot-ocsp-fetcher.sh && \
    chmod +x /usr/local/bin/certbot-ocsp-fetcher.sh && \
    git clone https://github.com/coreruleset/coreruleset --branch "$CRS_VER" /tmp/coreruleset && \
    mkdir -v /usr/local/nginx/conf/conf.d/include/coreruleset && \
    mv -v /tmp/coreruleset/crs-setup.conf.example /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example && \
    mv -v /tmp/coreruleset/plugins /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    mv -v /tmp/coreruleset/rules /usr/local/nginx/conf/conf.d/include/coreruleset/rules && \
    rm -r /tmp/* && \
    luarocks-5.1 install lua-cjson && \
    luarocks-5.1 install lua-resty-http && \
    luarocks-5.1 install lua-resty-string && \
    luarocks-5.1 install lua-resty-openssl && \
    yarn global add nginxbeautifier && \
    apk del --no-cache luarocks5.1 lua5.1-dev lua5.1-sec build-base git yarn && \
    ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js && \
    ln -s /app/index.js /usr/local/bin/index.js

COPY --from=crowdsec                  /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf      /usr/local/nginx/conf/conf.d/include/crowdsec_nginx.conf
COPY --from=crowdsec                  /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf    /usr/local/nginx/conf/conf.d/include/crowdsec.conf
COPY --from=crowdsec                  /src/crowdsec-nginx-bouncer/lua-mod/templates/captcha.html /usr/local/nginx/conf/conf.d/include/captcha.html
COPY --from=crowdsec                  /src/crowdsec-nginx-bouncer/lua-mod/templates/ban.html     /usr/local/nginx/conf/conf.d/include/ban.html
COPY --from=crowdsec                  /src/crowdsec-nginx-bouncer/lua-mod/lib/crowdsec.lua       /usr/local/nginx/lib/lua/crowdsec.lua
COPY --from=crowdsec                  /src/crowdsec-nginx-bouncer/lua-mod/lib/plugins            /usr/local/nginx/lib/lua/plugins
COPY --from=frontend                  /app/dist                                                  /html/frontend
COPY --from=zoeyvid/certbot-docker:69 /usr/local                                                 /usr/local

LABEL com.centurylinklabs.watchtower.monitor-only="true"
ENV NODE_ENV=production \
    NODE_CONFIG_DIR=/data/etc/npm \
    DB_SQLITE_FILE=/data/etc/npm/database.sqlite

ENV ACME_SERVER="https://acme-v02.api.letsencrypt.org/directory" \
    ACME_MUST_STAPLE=false \
    ACME_SERVER_TLS_VERIFY=true \
    PUID=0 \
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
    DISABLE_H3_QUIC=false \
    NGINX_ACCESS_LOG=false \
    NGINX_LOG_NOT_FOUND=false \
    NGINX_404_REDIRECT=false \
    NGINX_DISABLE_PROXY_BUFFERING=false \
    DISABLE_NGINX_BEAUTIFIER=false \
    CLEAN=true \
    FULLCLEAN=false \
    SKIP_IP_RANGES=false \
    LOGROTATE=false \
    LOGROTATIONS=3 \
    CRT=24 \
    IPRT=1 \
    GOA=false \
    GOACLA="--agent-list --real-os --double-decode --anonymize-ip --anonymize-level=1 --keep-last=30 --with-output-resolver --no-query-string" \
    PHP82=false \
    PHP83=false

WORKDIR /app
ENTRYPOINT ["tini", "--", "entrypoint.sh"]
HEALTHCHECK CMD healthcheck.sh
EXPOSE 80/tcp
EXPOSE 81/tcp
EXPOSE 443/tcp
EXPOSE 443/udp
