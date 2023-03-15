# This is a Dockerfile intended to be built using `docker buildx`
# for multi-arch support. Building with `docker build` may have unexpected results.

# This file assumes that the frontend has been built using ./scripts/frontend-build

FROM jc21/nginx-full:certbot-node

ARG TARGETPLATFORM
ARG BUILD_VERSION
ARG BUILD_COMMIT
ARG BUILD_DATE

ENV SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_FIX_ATTRS_HIDDEN=1 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=1 \
	NODE_ENV=production \
	NPM_BUILD_VERSION="${BUILD_VERSION}" \
	NPM_BUILD_COMMIT="${BUILD_COMMIT}" \
	NPM_BUILD_DATE="${BUILD_DATE}"

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends jq logrotate \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# s6 overlay
COPY scripts/install-s6 /tmp/install-s6
RUN /tmp/install-s6 "${TARGETPLATFORM}" && rm -f /tmp/install-s6

EXPOSE 80 81 443

COPY backend       /app
COPY frontend/dist /app/frontend
COPY global        /app/global

WORKDIR /app
RUN yarn install

# add late to limit cache-busting by modifications
COPY docker/rootfs /

# Remove frontend service not required for prod, dev nginx config as well
RUN rm -rf /etc/services.d/frontend /etc/nginx/conf.d/dev.conf

# Change permission of logrotate config file
RUN chmod 644 /etc/logrotate.d/nginx-proxy-manager

# fix for pip installs
# https://github.com/NginxProxyManager/nginx-proxy-manager/issues/1769
RUN pip uninstall --yes setuptools \
	&& pip install "setuptools==58.0.0"

VOLUME [ "/data", "/etc/letsencrypt" ]
ENTRYPOINT [ "/init" ]

LABEL org.label-schema.schema-version="1.0" \
	org.label-schema.license="MIT" \
	org.label-schema.name="nginx-proxy-manager" \
	org.label-schema.description="Docker container for managing Nginx proxy hosts with a simple, powerful interface " \
	org.label-schema.url="https://github.com/jc21/nginx-proxy-manager" \
	org.label-schema.vcs-url="https://github.com/jc21/nginx-proxy-manager.git" \
	org.label-schema.cmd="docker run --rm -ti jc21/nginx-proxy-manager:latest"
