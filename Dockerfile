# syntax=docker/dockerfile:labs
FROM alpine:3.23.2 AS nginx
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]

ARG LUAJIT_INC=/usr/include/luajit-2.1
ARG LUAJIT_LIB=/usr/lib

ARG NGINX_VER=release-1.29.4
ARG DTR_VER=1.29.2
ARG RCP_VER=1.29.4

ARG NB_VER=master
ARG NUB_VER=main
ARG ZNM_VER=master
ARG NF_VER=master
ARG HMNM_VER=v0.39
ARG NDK_VER=v0.3.4
ARG LNM_VER=v0.10.29R2

ARG NJS_VER=0.9.5
ARG NAL_VER=master
ARG VTS_VER=v0.2.5
ARG NNTLM_VER=master
ARG NHG2M_VER=3.4

ARG FLAGS
ARG CC=clang
ARG CFLAGS="$FLAGS -m64 -O3 -pipe -flto=thin -fstack-clash-protection -fstack-protector-strong -ftrivial-auto-var-init=zero -fno-delete-null-pointer-checks -fno-strict-overflow -fno-strict-aliasing -fno-plt -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=3 -Wformat=2 -Werror=format-security -Wno-sign-compare"
ARG CXX=clang++
ARG CXXFLAGS="$FLAGS -m64 -O3 -pipe -flto=thin -fstack-clash-protection -fstack-protector-strong -ftrivial-auto-var-init=zero -fno-delete-null-pointer-checks -fno-strict-overflow -fno-strict-aliasing -fno-plt -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=3 -D_GLIBCXX_ASSERTIONS -D_LIBCPP_ENABLE_THREAD_SAFETY_ANNOTATIONS=1 -D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_FAST -Wformat=2 -Werror=format-security -Wno-sign-compare"
ARG LDFLAGS="-fuse-ld=lld -m64 -Wl,-s -Wl,-O1 -Wl,-z,noexecstack -Wl,-z,relro -Wl,-z,now -Wl,--sort-common -Wl,--as-needed -Wl,-z,pack-relative-relocs"

COPY nginx/ngx_brotli.patch /src/ngx_brotli.patch
COPY nginx/ngx_unbrotli.patch /src/ngx_unbrotli.patch
COPY nginx/zstd-nginx-module.patch /src/zstd-nginx-module.patch
COPY nginx/attachment.patch /src/attachment.patch

RUN apk upgrade --no-cache -a && \
    apk add --no-cache ca-certificates build-base clang lld cmake ninja git \
                       linux-headers libatomic_ops-dev openssl-dev pcre2-dev luajit-dev zlib-dev brotli-dev zstd-dev geoip-dev libxslt-dev openldap-dev libmaxminddb-dev

RUN git clone --depth 1 https://github.com/nginx/nginx --branch "$NGINX_VER" /src/nginx && \
    cd /src/nginx && \
    wget -q https://raw.githubusercontent.com/nginx-modules/ngx_http_tls_dyn_size/refs/heads/master/nginx__dynamic_tls_records_"$DTR_VER"%2B.patch -O /src/nginx/1.patch && \
    git apply /src/nginx/1.patch && \
    wget -q https://raw.githubusercontent.com/openresty/openresty/refs/heads/master/patches/nginx/"$RCP_VER"/nginx-"$RCP_VER"-resolver_conf_parsing.patch -O /src/nginx/2.patch && \
    git apply /src/nginx/2.patch && \
    wget -q https://patch-diff.githubusercontent.com/raw/nginx/nginx/pull/689.patch -O /src/nginx/3.patch && \
    git apply /src/nginx/3.patch && \
    wget -q https://patch-diff.githubusercontent.com/raw/nginx/nginx/pull/1074.patch -O /src/nginx/4.patch && \
    git apply /src/nginx/4.patch && \
    sed -i "s|nginx/|NPMplus/|g" /src/nginx/src/core/nginx.h && \
    sed -i "s|Server: nginx|Server: NPMplus|g" /src/nginx/src/http/ngx_http_header_filter_module.c && \
    sed -i "/<hr><center>/d" /src/nginx/src/http/ngx_http_special_response.c && \
    \
    git clone --depth 1 https://github.com/google/ngx_brotli --branch "$NB_VER" /src/ngx_brotli && \
    cd /src/ngx_brotli && \
    git apply /src/ngx_brotli.patch && \
    git clone --depth 1 https://github.com/clyfish/ngx_unbrotli --branch "$NUB_VER" /src/ngx_unbrotli && \
    cd /src/ngx_unbrotli && \
    git apply /src/ngx_unbrotli.patch && \
    git clone --depth 1 https://github.com/tokers/zstd-nginx-module --branch "$ZNM_VER" /src/zstd-nginx-module && \
    cd /src/zstd-nginx-module && \
    wget -q https://patch-diff.githubusercontent.com/raw/tokers/zstd-nginx-module/pull/44.patch -O /src/zstd-nginx-module/1.patch && \
    git apply /src/zstd-nginx-module.patch && \
    git apply /src/zstd-nginx-module/1.patch && \
    git clone --depth 1 https://github.com/Zoey2936/ngx-fancyindex --branch "$NF_VER" /src/ngx-fancyindex && \
    git clone --depth 1 https://github.com/openresty/headers-more-nginx-module --branch "$HMNM_VER" /src/headers-more-nginx-module && \
    git clone --depth 1 https://github.com/vision5/ngx_devel_kit --branch "$NDK_VER" /src/ngx_devel_kit && \
    git clone --depth 1 https://github.com/openresty/lua-nginx-module --branch "$LNM_VER" /src/lua-nginx-module && \
    \
    git clone --depth 1 https://github.com/nginx/njs --branch "$NJS_VER" /src/njs && \
    git clone --depth 1 https://github.com/kvspb/nginx-auth-ldap --branch "$NAL_VER" /src/nginx-auth-ldap && \
    git clone --depth 1 https://github.com/vozlt/nginx-module-vts --branch "$VTS_VER" /src/nginx-module-vts && \
    git clone --depth 1 https://github.com/gabihodoroaga/nginx-ntlm-module --branch "$NNTLM_VER" /src/nginx-ntlm-module && \
    git clone --depth 1 https://github.com/leev/ngx_http_geoip2_module --branch "$NHG2M_VER" /src/ngx_http_geoip2_module

RUN cd /src/nginx && \
    /src/nginx/auto/configure \
    --build=nginx \
    --with-debug \
    --with-compat \
    --with-threads \
    --with-file-aio \
    --with-libatomic \
    --with-pcre \
    --with-pcre-jit \
    --without-select_module \
    --without-poll_module \
    --with-stream \
    --with-stream_ssl_module \
    --with-stream_ssl_preread_module \
    --with-stream_realip_module \
    --with-http_v2_module \
    --with-http_v3_module \
    --with-http_ssl_module \
    --with-http_realip_module \
    --with-http_gunzip_module \
    --with-http_gzip_static_module \
    --with-http_sub_module \
    --with-http_addition_module \
    --with-http_stub_status_module \
    --with-http_auth_request_module \
    --add-module=/src/ngx_brotli \
    --add-module=/src/ngx_unbrotli \
    --add-module=/src/zstd-nginx-module \
    --add-module=/src/ngx-fancyindex \
    --add-module=/src/headers-more-nginx-module \
    --add-module=/src/ngx_devel_kit \
    --add-module=/src/lua-nginx-module \
    --with-http_geoip_module=dynamic \
    --with-stream_geoip_module=dynamic \
    --add-dynamic-module=/src/njs/nginx \
    --add-dynamic-module=/src/nginx-auth-ldap \
    --add-dynamic-module=/src/nginx-module-vts \
    --add-dynamic-module=/src/nginx-ntlm-module \
    --add-dynamic-module=/src/ngx_http_geoip2_module \
    --with-ld-opt="$LDFLAGS" && \
    \
    make -j "$(nproc)" install

RUN git clone --depth 1 https://github.com/openappsec/attachment /src/attachment && \
    cd /src/attachment && \
    git apply /src/attachment.patch && \
    cmake /src/attachment -G Ninja && \
    ninja && \
    mv -v /src/attachment/attachments/nginx/ngx_module/libngx_module.so /usr/local/nginx/modules/libngx_module.so

RUN find /usr/local/nginx/modules -name "*.so" -exec strip -s {} \; && \
    strip -s /usr/local/nginx/sbin/nginx && \
    strip -s /src/attachment/core/shmem_ipc/libosrc_shmem_ipc.so && \
    strip -s /src/attachment/core/compression/libosrc_compression_utils.so && \
    strip -s /src/attachment/attachments/nginx/nginx_attachment_util/libosrc_nginx_attachment_util.so && \
    \
    find /usr/local/nginx/modules -name "*.so" -exec file {} \; && \
    file /usr/local/nginx/sbin/nginx && \
    file /src/attachment/core/shmem_ipc/libosrc_shmem_ipc.so && \
    file /src/attachment/core/compression/libosrc_compression_utils.so && \
    file /src/attachment/attachments/nginx/nginx_attachment_util/libosrc_nginx_attachment_util.so && \
    /usr/local/nginx/sbin/nginx -V


FROM --platform="$BUILDPLATFORM" alpine:3.23.2 AS frontend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY frontend /app
WORKDIR /app/frontend
RUN apk upgrade --no-cache -a && \
    apk add --no-cache nodejs pnpm && \
    pnpm install --frozen-lockfile && \
    pnpm formatjs compile-folder src/locale/src src/locale/lang && \
    pnpm tsc && \
    pnpm vite build

FROM alpine:3.23.2 AS backend
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG NODE_ENV=production
COPY backend /app
WORKDIR /app
RUN apk upgrade --no-cache -a && \
    apk add --no-cache nodejs pnpm binutils file && \
    pnpm install --frozen-lockfile --prod && \
    pnpm cache delete && \
    find node_modules -name "*.map" -delete && \
    rm -r node_modules/better-sqlite3/deps/sqlite3 && \
    find /app/node_modules -name "*.node" -type f -exec strip -s {} \; && \
    find /app/node_modules -name "*.node" -type f -exec file {} \;


FROM alpine:3.23.2
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ENV NODE_ENV=production
ARG LRC_VER=v0.1.32R1
ARG LRL_VER=v0.15
ARG LCSB_VER=v1.0.13

COPY --from=nginx /usr/local/nginx                                                                         /usr/local/nginx
COPY --from=nginx /src/attachment/core/shmem_ipc/libosrc_shmem_ipc.so                                      /usr/local/lib/libosrc_shmem_ipc.so
COPY --from=nginx /src/attachment/core/compression/libosrc_compression_utils.so                            /usr/local/lib/libosrc_compression_utils.so
COPY --from=nginx /src/attachment/attachments/nginx/nginx_attachment_util/libosrc_nginx_attachment_util.so /usr/local/lib/libosrc_nginx_attachment_util.so

COPY --from=backend  /app      /app

COPY rootfs  /
COPY LICENSE /LICENSE
COPY COPYING /COPYING

WORKDIR /app
RUN apk upgrade --no-cache -a && \
    apk add --no-cache tzdata tini \
                       libssl3 libcrypto3 pcre2 luajit zlib brotli zstd lua5.1-cjson geoip libxml2 libldap libmaxminddb-libs \
                       curl coreutils findutils grep jq openssl shadow su-exec util-linux-misc \
                       bash bash-completion nano \
                       logrotate goaccess fcgi \
                       luarocks5.1 git make \
                       nodejs python3 && \
    \
    luarocks-5.1 install lua-resty-http && \
    luarocks-5.1 install lua-resty-string && \
    luarocks-5.1 install lua-resty-openssl && \
    luarocks-5.1 install lua-resty-openidc && \
    luarocks-5.1 install lua-resty-session && \
    \
    git clone --depth 1 https://github.com/openresty/lua-resty-core --branch "$LRC_VER" /src/lua-resty-core && \
    cd /src/lua-resty-core && \
    make -j "$(nproc)" install LUA_LIB_DIR=/usr/local/share/lua/5.1 && \
    \
    git clone --depth 1 https://github.com/openresty/lua-resty-lrucache --branch "$LRL_VER" /src/lua-resty-lrucache && \
    cd /src/lua-resty-lrucache && \
    make -j "$(nproc)" install LUA_LIB_DIR=/usr/local/share/lua/5.1 && \
    \
    git clone --depth 1 https://github.com/crowdsecurity/lua-cs-bouncer --branch "$LCSB_VER" /src/lua-cs-bouncer && \
    mv /src/lua-cs-bouncer/lib/* /usr/local/share/lua/5.1 && \
    mv /src/lua-cs-bouncer/templates/captcha.html /etc/captcha.html.original && \
    mv /src/lua-cs-bouncer/templates/ban.html /etc/ban.html.original && \
    \
    cd && \
    rm -r /src /tmp/luarocks_local_cache-* && \
    apk del --no-cache luarocks5.1 git make && \
    \
    sed -i "s|placeholder|$(cat /app/package.json | jq -r .version)|g" /usr/local/nginx/conf/conf.d/crowdsec.conf.disabled && \
    \
    python3 -m venv /usr/local && \
    pip install --no-cache-dir --upgrade pip certbot && \
    \
    wget -q https://raw.githubusercontent.com/tomwassenberg/certbot-ocsp-fetcher/refs/heads/main/certbot-ocsp-fetcher -O - | sed "s|/live||g" > /usr/local/bin/certbot-ocsp-fetcher.sh && \
    wget -q https://raw.githubusercontent.com/vasilevich/nginxbeautifier/5cee8db2a505f2a253e24691399c828c043071fc/index.js -O /usr/local/bin/nginxbeautifier && \
    wget -q https://raw.githubusercontent.com/vasilevich/nginxbeautifier/5cee8db2a505f2a253e24691399c828c043071fc/nginxbeautifier.js -O /usr/local/bin/nginxbeautifier.js && \
    \
    ln -s /usr/local/nginx/sbin/nginx /usr/local/bin/nginx && \
    ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js && \
    ln -s /app/index.js /usr/local/bin/index.js && \
    \
    chmod +x /usr/local/bin/*

COPY --from=frontend /app/dist /app/frontend

ENTRYPOINT ["tini", "--", "entrypoint.sh"]
HEALTHCHECK CMD healthcheck.sh

LABEL com.centurylinklabs.watchtower.monitor-only="true"
LABEL wud.watch="false"
LABEL wud.watch.digest="false"
