# This is a Dockerfile intended to be built using `docker buildx`
# for multi-arch support. Building with `docker build` may have unexpected results.

# This file assumes that the frontend has been built using ./scripts/frontend-build

ARG BASE_IMAGE=nginxproxymanager/nginx-full:certbot-node
FROM nginxproxymanager/testca AS testca

# Download the current upstream stable branches in an intermediate stage. Nothing
# from this stage except the Lua files and templates reaches the final image.
FROM $BASE_IMAGE AS crowdsec-source

ARG CROWDSEC_OPENRESTY_BOUNCER_REF=main
ARG CROWDSEC_LUA_BOUNCER_REF=main
ARG CROWDSEC_CACHEBUST=0

COPY docker/crowdsec-build-revision /tmp/crowdsec-build-revision
ADD https://codeload.github.com/crowdsecurity/cs-openresty-bouncer/tar.gz/${CROWDSEC_OPENRESTY_BOUNCER_REF}?cachebust=${CROWDSEC_CACHEBUST} /tmp/cs-openresty-bouncer.tar.gz
ADD https://codeload.github.com/crowdsecurity/lua-cs-bouncer/tar.gz/${CROWDSEC_LUA_BOUNCER_REF}?cachebust=${CROWDSEC_CACHEBUST} /tmp/lua-cs-bouncer.tar.gz

RUN mkdir -p /tmp/crowdsec-source /out/lualib/plugins/crowdsec /out/templates \
	&& tar -xzf /tmp/cs-openresty-bouncer.tar.gz -C /tmp/crowdsec-source \
	&& tar -xzf /tmp/lua-cs-bouncer.tar.gz -C /tmp/crowdsec-source \
	&& cp -R /tmp/crowdsec-source/lua-cs-bouncer-${CROWDSEC_LUA_BOUNCER_REF}/lib/. /out/lualib/ \
	&& cp -R /tmp/crowdsec-source/cs-openresty-bouncer-${CROWDSEC_OPENRESTY_BOUNCER_REF}/vendor/lua-resty-http/lib/. /out/lualib/plugins/crowdsec/ \
	&& cp -R /tmp/crowdsec-source/lua-cs-bouncer-${CROWDSEC_LUA_BOUNCER_REF}/templates/. /out/templates/

FROM $BASE_IMAGE

ARG TARGETPLATFORM
ARG BUILD_VERSION
ARG BUILD_COMMIT
ARG BUILD_DATE

# See: https://github.com/just-containers/s6-overlay/blob/master/README.md
ENV SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=1 \
	S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 \
	S6_FIX_ATTRS_HIDDEN=1 \
	S6_KILL_FINISH_MAXTIME=10000 \
	S6_VERBOSITY=1 \
	NODE_ENV=production \
	NPM_BUILD_VERSION="${BUILD_VERSION}" \
	NPM_BUILD_COMMIT="${BUILD_COMMIT}" \
	NPM_BUILD_DATE="${BUILD_DATE}" \
	NODE_OPTIONS="--openssl-legacy-provider"

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends jq logrotate \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# s6 overlay
COPY docker/scripts/install-s6 /tmp/install-s6
RUN /tmp/install-s6 "${TARGETPLATFORM}" && rm -f /tmp/install-s6

EXPOSE 80 81 443

COPY backend       /app
COPY frontend/dist /app/frontend
COPY docker/rootfs /
COPY --from=crowdsec-source /out/lualib/ /etc/nginx/lualib/
COPY --from=crowdsec-source /out/templates/ /var/lib/crowdsec/lua/templates/

# Copy test CA cert for use in container and add to trusted certs from a self-signed CA
COPY --from=testca /home/step/certs/root_ca.crt /etc/ssl/certs/NginxProxyManager.crt
WORKDIR /etc/ssl/certs
RUN ln -s NginxProxyManager.crt 1d0e3f10.0 && update-ca-certificates

WORKDIR /app
RUN yarn install \
	&& yarn cache clean

# Remove frontend service not required for prod, dev nginx config as well
RUN rm -rf /etc/s6-overlay/s6-rc.d/user/contents.d/frontend /etc/nginx/conf.d/dev.conf \
	&& chmod 644 /etc/logrotate.d/nginx-proxy-manager

VOLUME [ "/data" ]
ENTRYPOINT [ "/init" ]

LABEL org.label-schema.schema-version="1.0" \
	org.label-schema.license="MIT" \
	org.label-schema.name="nginx-proxy-manager" \
	org.label-schema.description="Docker container for managing Nginx proxy hosts with a simple, powerful interface " \
	org.label-schema.url="https://github.com/jc21/nginx-proxy-manager" \
	org.label-schema.vcs-url="https://github.com/jc21/nginx-proxy-manager.git" \
	org.label-schema.cmd="docker run --rm -ti jc21/nginx-proxy-manager:latest"
