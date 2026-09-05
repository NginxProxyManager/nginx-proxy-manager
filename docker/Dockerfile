# This is a Dockerfile intended to be built using `docker buildx`
# for multi-arch support. Building with `docker build` may have unexpected results.

# Frontend assets are built in the frontend-build stage below.

ARG BASE_IMAGE=nginxproxymanager/nginx-full:certbot-node
ARG BUILDPLATFORM

# Build frontend assets in Docker so image builds do not depend on an ignored,
# pre-existing frontend/dist directory in the host build context.
FROM --platform=$BUILDPLATFORM $BASE_IMAGE AS frontend-build

ENV CI=true \
	NODE_OPTIONS="--openssl-legacy-provider"

WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock frontend/.npmrc ./
RUN yarn install --frozen-lockfile --network-timeout 600000
COPY frontend ./
RUN yarn lint \
	&& yarn locale-compile \
	&& yarn vitest run --no-color \
	&& yarn build

FROM nginxproxymanager/testca AS testca
FROM $BASE_IMAGE
COPY docker/scripts/install-openresty /tmp/install-openresty
RUN sed -i 's/\r$//' /tmp/install-openresty && sh /tmp/install-openresty

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
COPY --from=frontend-build /app/frontend/dist /app/frontend
COPY docker/rootfs /

# Copy test CA cert for use in container and add to trusted certs from a self-signed CA
COPY --from=testca /home/step/certs/root_ca.crt /etc/ssl/certs/NginxProxyManager.crt
WORKDIR /etc/ssl/certs
RUN ln -s NginxProxyManager.crt 1d0e3f10.0 && update-ca-certificates

WORKDIR /app
RUN yarn install --frozen-lockfile --network-timeout 600000 \
	&& yarn validate:proxy-runtime \
	&& yarn cache clean

# Remove frontend service not required for prod, dev nginx config as well
RUN rm -rf /etc/s6-overlay/s6-rc.d/user/contents.d/frontend /etc/nginx/conf.d/dev.conf \
	&& chmod 644 /etc/logrotate.d/nginx-proxy-manager

VOLUME [ "/data" ]
ENTRYPOINT [ "/init" ]

LABEL org.opencontainers.image.title="Nginx Proxy Manager - Lorwell Fork" \
	org.opencontainers.image.description="Independently maintained Nginx proxy management interface" \
	org.opencontainers.image.licenses="MIT" \
	org.opencontainers.image.source="https://github.com/Lorwell/nginx-proxy-manager" \
	org.opencontainers.image.url="https://github.com/Lorwell/nginx-proxy-manager" \
	org.opencontainers.image.version="${BUILD_VERSION}" \
	org.opencontainers.image.revision="${BUILD_COMMIT}" \
	org.opencontainers.image.created="${BUILD_DATE}"
