# This is a Dockerfile intended to be built using `docker buildx`
# for multi-arch support. Building with `docker build` may have unexpected results.

# This file assumes that these scripts have been run first:
# - ./scripts/ci/build-frontend

FROM nginxproxymanager/testca as testca
FROM letsencrypt/pebble as pebbleca
FROM jc21/gotools:latest AS gobuild

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG BUILD_COMMIT
ARG BUILD_VERSION
ARG GOPRIVATE
ARG GOPROXY
ARG SENTRY_DSN

ENV BUILD_COMMIT="${BUILD_COMMIT:-dev}" \
	BUILD_VERSION="${BUILD_VERSION:-0.0.0}" \
	CGO_ENABLED=1 \
	GO111MODULE=on \
	GOPRIVATE="${GOPRIVATE:-}" \
	GOPROXY="${GOPROXY:-}" \
	SENTRY_DSN="${SENTRY_DSN:-}"

COPY scripts /scripts
COPY backend /app
WORKDIR /app

RUN mkdir -p /dist \
	&& /scripts/go-multiarch-wrapper /dist/server

#===============
# Final image
#===============

FROM nginxproxymanager/nginx-full:acmesh AS final

COPY --from=gobuild /dist/server /app/bin/server
# these certs are used for testing in CI
COPY --from=pebbleca /test/certs/pebble.minica.pem /etc/ssl/certs/pebble.minica.pem
COPY --from=testca /home/step/certs/root_ca.crt /etc/ssl/certs/NginxProxyManager.crt

# These acmesh vars are defined in the base image
ENV SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_LOGGING=0 \
	ACMESH_CONFIG_HOME=/data/.acme.sh/config \
	ACMESH_HOME=/data/.acme.sh \
	CERT_HOME=/data/.acme.sh/certs \
	LE_CONFIG_HOME=/data/.acme.sh/config \
	LE_WORKING_DIR=/data/.acme.sh

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf

# fail2ban
RUN apt-get update \
	&& apt-get install -y --no-install-recommends fail2ban \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/* /etc/fail2ban

# s6 overlay
COPY scripts/install-s6 /tmp/install-s6
RUN /tmp/install-s6 "${TARGETPLATFORM}" && rm -rf /tmp/*

EXPOSE 80/tcp 81/tcp 443/tcp

COPY docker/rootfs /

# Remove frontend service not required for prod, dev nginx config as well
# and remove any other cruft
RUN rm -rf /etc/services.d/frontend \
	/etc/nginx/conf.d/dev.conf \
	/var/cache/* \
	/var/log/* \
	/tmp/* \
	/var/lib/dpkg/status-old

VOLUME /data

CMD [ "/init" ]

ARG NOW
ARG BUILD_VERSION
ARG BUILD_COMMIT
ARG BUILD_DATE

ENV NPM_BUILD_VERSION="${BUILD_VERSION:-0.0.0}" \
	NPM_BUILD_COMMIT="${BUILD_COMMIT:-dev}" \
	NPM_BUILD_DATE="${BUILD_DATE:-}"

LABEL org.label-schema.schema-version="1.0" \
	org.label-schema.license="MIT" \
	org.label-schema.name="nginx-proxy-manager" \
	org.label-schema.description="Nginx Host Management and Proxy" \
	org.label-schema.build-date="${NOW:-}" \
	org.label-schema.version="${BUILD_VERSION:-0.0.0}" \
	org.label-schema.url="https://nginxproxymanager.com" \
	org.label-schema.vcs-url="https://github.com/NginxProxyManager/nginx-proxy-manager.git" \
	org.label-schema.vcs-ref="${BUILD_COMMIT:-dev}" \
	org.label-schema.cmd="docker run --rm -ti jc21/nginx-proxy-manager:${BUILD_VERSION:-0.0.0}"
