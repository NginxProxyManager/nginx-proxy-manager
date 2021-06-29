# This is a Dockerfile intended to be built using `docker buildx`
# for multi-arch support. Building with `docker build` may have unexpected results.

# This file assumes that these scripts have been run first:
# - ./scripts/ci/build-frontend

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

COPY backend /app
WORKDIR /app

RUN mkdir -p /dist \
	&& go build \
	-ldflags "-w -s -X main.commit=${BUILD_COMMIT:-notset} -X main.version=${BUILD_VERSION} -X main.sentryDSN=${SENTRY_DSN:-}" \
	-o "/dist/server" \
	./cmd/server

#===============
# Final image
#===============

FROM jc21/nginx-full:github-acme.sh AS final

COPY --from=gobuild /dist/server /app/bin/server
COPY backend/migrations /app/migrations

ENV SUPPRESS_NO_CONFIG_WARNING=1
ENV S6_FIX_ATTRS_HIDDEN=1
RUN echo "fs.file-max = 65535" > /etc/sysctl.conf

# s6 overlay
RUN curl -L -o /tmp/s6-overlay-amd64.tar.gz "https://github.com/just-containers/s6-overlay/releases/download/v2.2.0.3/s6-overlay-amd64.tar.gz" \
	&& tar -xzf /tmp/s6-overlay-amd64.tar.gz -C /

EXPOSE 80/tcp 81/tcp 443/tcp

COPY docker/rootfs /

# Remove frontend service not required for prod, dev nginx config as well
RUN rm -rf /etc/services.d/frontend /etc/nginx/conf.d/dev.conf

VOLUME /data

CMD [ "/init" ]
# TODO: remove healthchecks
HEALTHCHECK --interval=15s --timeout=3s CMD curl -f http://127.0.0.1:81/api || exit 1

ARG NOW
ARG BUILD_VERSION
ARG BUILD_COMMIT
ARG BUILD_DATE

ENV DATABASE_URL="sqlite:////data/nginxproxymanager.db" \
	DBMATE_MIGRATIONS_DIR="/app/migrations" \
	DBMATE_NO_DUMP_SCHEMA="1" \
	DBMATE_SCHEMA_FILE="/data/schema.sql" \
	NPM_BUILD_VERSION="${BUILD_VERSION:-0.0.0}" \
	NPM_BUILD_COMMIT="${BUILD_COMMIT:-dev}" \
	NPM_BUILD_DATE="${BUILD_DATE:-}"

LABEL org.label-schema.schema-version="1.0" \
	org.label-schema.license="MIT" \
	org.label-schema.name="nginx-proxy-manager" \
	org.label-schema.description="Nginx Host Management and Proxy" \
	org.label-schema.build-date="${NOW:-}" \
	org.label-schema.version="${BUILD_VERSION:-0.0.0}" \
	org.label-schema.url="https://nginxproxymanager.com" \
	org.label-schema.vcs-url="https://github.com/jc21/nginx-proxy-manager.git" \
	org.label-schema.vcs-ref="${BUILD_COMMIT:-dev}" \
	org.label-schema.cmd="docker run --rm -ti jc21/nginx-proxy-manager:${BUILD_VERSION:-0.0.0}"
