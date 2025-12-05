# syntax=docker/dockerfile:labs
FROM --platform="$BUILDPLATFORM" alpine:3.23.0 AS frontend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY frontend /app
WORKDIR /app/frontend
RUN apk upgrade --no-cache -a && \
    apk add --no-cache nodejs yarn && \
    yarn install --production=false && \
    yarn formatjs compile-folder src/locale/src src/locale/lang && \
    yarn tsc && \
    yarn vite build

FROM alpine:3.23.0 AS backend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY backend /app
WORKDIR /app
RUN apk upgrade --no-cache -a && \
    apk add --no-cache nodejs yarn npm binutils file && \
    yarn global add clean-modules && \
    yarn install && \
    yarn cache clean && \
    clean-modules --yes && \
    find /app/node_modules -name "*.node" -type f -exec strip -s {} \; && \
    find /app/node_modules -name "*.node" -type f -exec file {} \;

FROM --platform="$BUILDPLATFORM" alpine:3.23.0 AS crowdsec
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG CSNB_VER=v1.1.5
WORKDIR /src
RUN apk upgrade --no-cache -a && \
    apk add --no-cache git make && \
    git clone --depth 1 https://github.com/crowdsecurity/cs-nginx-bouncer --branch "$CSNB_VER" /src && \
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


FROM zoeyvid/nginx-quic:681-python
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ENV NODE_ENV=production

COPY rootfs /
COPY --from=backend /app /app
WORKDIR /app
RUN apk upgrade --no-cache -a && \
    apk add --no-cache tzdata tini \
    lua5.1-cjson \
    luarocks5.1 \
    nodejs \
    openssl \
    logrotate goaccess \
    bash bash-completion nano fcgi \
    curl coreutils findutils grep jq shadow su-exec util-linux-misc && \
    # until https://gitlab.alpinelinux.org/alpine/aports/-/issues/17778 is fixed
    sed -i 's|function M\.math\.tointeger(n)|&\nn = tonumber(n)|' /usr/share/lua/5.1/compat53/module.lua && \
    luarocks-5.1 install lua-resty-http && \
    luarocks-5.1 install lua-resty-string && \
    luarocks-5.1 install lua-resty-openssl && \
    luarocks-5.1 install lua-resty-openidc && \
    luarocks-5.1 install lua-resty-session && \
    apk del luarocks5.1 && \
    wget -q https://raw.githubusercontent.com/tomwassenberg/certbot-ocsp-fetcher/refs/heads/main/certbot-ocsp-fetcher -O - | sed "s|/live||g" > /usr/local/bin/certbot-ocsp-fetcher.sh && \
    wget -q https://raw.githubusercontent.com/vasilevich/nginxbeautifier/master/index.js -O /usr/local/bin/nginxbeautifier && \
    wget -q https://raw.githubusercontent.com/vasilevich/nginxbeautifier/master/nginxbeautifier.js -O /usr/local/bin/nginxbeautifier.js && \
    ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js && \
    ln -s /app/index.js /usr/local/bin/index.js && \
    chmod +x /usr/local/bin/*

COPY --from=frontend /app/dist /html/frontend

COPY --from=crowdsec /src/crowdsec-nginx-bouncer/nginx/crowdsec_nginx.conf      /usr/local/nginx/conf/conf.d/include/crowdsec_nginx.conf
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/config_example.conf    /usr/local/nginx/conf/conf.d/include/crowdsec.conf
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/templates/captcha.html /usr/local/nginx/conf/conf.d/include/captcha.html
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/templates/ban.html     /usr/local/nginx/conf/conf.d/include/ban.html
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/lib/crowdsec.lua       /usr/local/share/lua/5.1/crowdsec.lua
COPY --from=crowdsec /src/crowdsec-nginx-bouncer/lua-mod/lib/plugins            /usr/local/share/lua/5.1/plugins

ENTRYPOINT ["tini", "--", "entrypoint.sh"]
HEALTHCHECK CMD healthcheck.sh
