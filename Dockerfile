# syntax=docker/dockerfile:labs
FROM --platform="$BUILDPLATFORM" alpine:3.22.0 AS frontend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY frontend                        /app
COPY global/certbot-dns-plugins.json /app/certbot-dns-plugins.json
WORKDIR /app/frontend
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates nodejs yarn git python3 py3-pip build-base && \
    yarn install && \
    yarn build
COPY darkmode.css /app/dist/css/darkmode.css
COPY security.txt /app/dist/.well-known/security.txt


FROM --platform="$BUILDPLATFORM" alpine:3.22.0 AS build-backend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production \
    TARGETARCH
COPY backend                         /app
COPY global/certbot-dns-plugins.json /app/certbot-dns-plugins.json
WORKDIR /app
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates nodejs yarn file npm && \
    yarn global add clean-modules && \
    if [ "$TARGETARCH" = "amd64" ]; then npm_config_arch=x64 npm_config_target_arch=x64 yarn install; rm -vr /app/node_modules/bcrypt/prebuilds/darwin-* /app/node_modules/bcrypt/prebuilds/win32-* /app/node_modules/bcrypt/prebuilds/linux-arm /app/node_modules/bcrypt/prebuilds/linux-arm64 /app/node_modules/bcrypt/prebuilds/linux-x64/bcrypt.glibc.node; \
    elif [ "$TARGETARCH" = "arm64" ]; then npm_config_arch=arm64 npm_config_target_arch=arm64 yarn install; rm -vr /app/node_modules/bcrypt/prebuilds/darwin-* /app/node_modules/bcrypt/prebuilds/win32-* /app/node_modules/bcrypt/prebuilds/linux-arm /app/node_modules/bcrypt/prebuilds/linux-x64 /app/node_modules/bcrypt/prebuilds/linux-arm64/bcrypt.glibc.node; \
    else yarn install; fi && \
    yarn cache clean && \
    clean-modules --yes
FROM alpine:3.22.0 AS strip-backend
COPY --from=build-backend /app /app
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates binutils file && \
    find /app/node_modules -name "*.node" -type f -exec strip -s {} \; && \
    find /app/node_modules -name "*.node" -type f -exec file {} \;

FROM --platform="$BUILDPLATFORM" alpine:3.22.0 AS crowdsec
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG CSNB_VER=v1.1.2
WORKDIR /src
RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates git build-base && \
    git clone --recursive https://github.com/crowdsecurity/cs-nginx-bouncer --branch "$CSNB_VER" /src && \
    make && \
    tar xzf crowdsec-nginx-bouncer.tgz && \
    mv crowdsec-nginx-bouncer-* crowdsec-nginx-bouncer && \
    sed -i "/lua_package_path/d" /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i "/lua_ssl_trusted_certificate/d" /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i "s|/etc/crowdsec/bouncers/crowdsec-nginx-bouncer.conf|/data/crowdsec/crowdsec.conf|g" /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i "s|crowdsec-nginx-bouncer|crowdsec-npmplus-bouncer|g" /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf && \
    sed -i "s|API_KEY=.*|API_KEY=|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|ENABLED=.*|ENABLED=false|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|API_URL=.*|API_URL=http://127.0.0.1:8080|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|BAN_TEMPLATE_PATH=.*|BAN_TEMPLATE_PATH=/data/crowdsec/ban.html|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|CAPTCHA_TEMPLATE_PATH=.*|CAPTCHA_TEMPLATE_PATH=/data/crowdsec/captcha.html|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|APPSEC_URL=.*|APPSEC_URL=http://127.0.0.1:7422|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|APPSEC_FAILURE_ACTION=.*|APPSEC_FAILURE_ACTION=deny|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|REQUEST_TIMEOUT=.*|REQUEST_TIMEOUT=2500|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|APPSEC_CONNECT_TIMEOUT=.*|APPSEC_CONNECT_TIMEOUT=1000|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|APPSEC_SEND_TIMEOUT=.*|APPSEC_SEND_TIMEOUT=30000|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf && \
    sed -i "s|APPSEC_PROCESS_TIMEOUT=.*|APPSEC_PROCESS_TIMEOUT=10000|g" /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf


FROM zoeyvid/nginx-quic:515-python
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ENV NODE_ENV=production
ARG CRS_VER=v4.15.0

COPY rootfs /
COPY --from=strip-backend /app /app
WORKDIR /app

RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates tzdata tini curl util-linux-misc \
    nodejs \
    bash nano \
    logrotate goaccess fcgi \
    lua5.1-lzlib lua5.1-socket \
    coreutils grep findutils jq shadow su-exec \
    luarocks5.1 lua5.1-dev lua5.1-sec build-base git yarn && \
#    curl https://raw.githubusercontent.com/acmesh-official/acme.sh/master/acme.sh | sh -s -- --install-online --home /usr/local/acme.sh --nocron && \
#    ln -s /usr/local/acme.sh/acme.sh /usr/local/bin/acme.sh && \
    curl https://raw.githubusercontent.com/tomwassenberg/certbot-ocsp-fetcher/refs/heads/main/certbot-ocsp-fetcher -o /usr/local/bin/certbot-ocsp-fetcher.sh && \
    sed -i "s|/live||g" /usr/local/bin/certbot-ocsp-fetcher.sh && \
    chmod +x /usr/local/bin/certbot-ocsp-fetcher.sh && \
    git clone https://github.com/coreruleset/coreruleset --branch "$CRS_VER" /tmp/coreruleset && \
    mkdir -v /usr/local/nginx/conf/conf.d/include/coreruleset && \
    mv -v /tmp/coreruleset/crs-setup.conf.example /usr/local/nginx/conf/conf.d/include/coreruleset/crs-setup.conf.example && \
    mv -v /tmp/coreruleset/plugins /usr/local/nginx/conf/conf.d/include/coreruleset/plugins && \
    mv -v /tmp/coreruleset/rules /usr/local/nginx/conf/conf.d/include/coreruleset/rules && \
    luarocks-5.1 install lua-cjson && \
    luarocks-5.1 install lua-resty-http && \
    luarocks-5.1 install lua-resty-string && \
    luarocks-5.1 install lua-resty-openssl && \
    luarocks-5.1 install lua-resty-openidc && \
    luarocks-5.1 install lua-resty-session && \
    yarn global add nginxbeautifier && \
    yarn cache clean && \
    apk del --no-cache luarocks5.1 lua5.1-dev lua5.1-sec build-base git yarn && \
    ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js && \
    ln -s /app/index.js /usr/local/bin/index.js && \
    rm -r /tmp/*

COPY --from=frontend /app/dist /html/frontend
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf      /usr/local/nginx/conf/conf.d/include/crowdsec_nginx.conf
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf    /usr/local/nginx/conf/conf.d/include/crowdsec.conf
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/templates/captcha.html /usr/local/nginx/conf/conf.d/include/captcha.html
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/templates/ban.html     /usr/local/nginx/conf/conf.d/include/ban.html
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/lib/crowdsec.lua       /usr/local/nginx/lib/lua/crowdsec.lua
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/lib/plugins            /usr/local/nginx/lib/lua/plugins

ENTRYPOINT ["tini", "--", "entrypoint.sh"]
HEALTHCHECK CMD healthcheck.sh
