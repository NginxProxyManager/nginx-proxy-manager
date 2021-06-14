# This is a Dockerfile intended to be built using `docker buildx`
# for multi-arch support. Building with `docker build` may have unexpected results.

# This file assumes that the frontend has been built using ./scripts/frontend-build

#===============
# gobuild
#===============

FROM jc21/nginx-full:github-acme.sh-golang AS gobuild

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG GOPROXY
ARG GOPRIVATE

ENV GOPROXY=$GOPROXY \
	GOPRIVATE=$GOPRIVATE \
	GO111MODULE=on \
	CGO_ENABLED=1

# Nancy
RUN go get github.com/sonatype-nexus-community/nancy
RUN mkdir -p /workspace
WORKDIR /workspace
COPY backend/go.mod backend/go.sum backend/.nancy-ignore ./
RUN go mod download

ARG NANCY_TOKEN
ARG NANCY_USER
RUN go list -json -m all | nancy sleuth --quiet --username "${NANCY_USER}" --token "${NANCY_TOKEN}"
RUN rm -rf /workspace

# Code
WORKDIR /app
COPY . .
WORKDIR /app/backend

# Build
RUN go mod download
RUN echo "Testing and compiling project" \
	&& [ -z "$(go tool fix -diff ./internal)" ]

# Disabled as CI has issues at the moment
#RUN if [ "$TARGETPLATFORM" == "" ] || [ "$TARGETPLATFORM" == "linux/amd64" ]; then golangci-lint -v run ./...; fi

RUN richgo test -cover -v ./internal/...
RUN richgo test -bench=. ./internal/...

ARG BUILD_VERSION
ARG BUILD_COMMIT
ARG SENTRY_DSN
RUN go build \
	-ldflags "-w -s -X main.commit=${BUILD_COMMIT} -X main.version=${BUILD_VERSION} -X main.sentryDSN=${SENTRY_DSN:-}" \
	-o ../dist/bin/server \
	-v ./cmd/server

#===============
# Final image
#===============

FROM jc21/nginx-full:github-acme.sh

COPY --from=gobuild /app/dist /app
COPY --from=gobuild /app/backend/migrations /app/migrations
# COPY frontend/build /app/frontend

ENV SUPPRESS_NO_CONFIG_WARNING=1
ENV S6_FIX_ATTRS_HIDDEN=1
RUN echo "fs.file-max = 65535" > /etc/sysctl.conf

# s6 overlay
RUN curl -L -o /tmp/s6-overlay-amd64.tar.gz "https://github.com/just-containers/s6-overlay/releases/download/v1.22.1.0/s6-overlay-amd64.tar.gz" \
	&& tar -xzf /tmp/s6-overlay-amd64.tar.gz -C /

EXPOSE 80/tcp 81/tcp 443/tcp

COPY docker/rootfs /

# Remove frontend service not required for prod, dev nginx config as well
RUN rm -rf /etc/services.d/frontend /etc/nginx/conf.d/dev.conf

VOLUME /data

CMD [ "/init" ]
HEALTHCHECK --interval=15s --timeout=3s CMD curl -f http://127.0.0.1:81/api || exit 1

ARG NOW
ARG BUILD_VERSION
ARG BUILD_COMMIT
ARG BUILD_DATE
ENV NPM_BUILD_VERSION="${BUILD_VERSION}" NPM_BUILD_COMMIT="${BUILD_COMMIT}" NPM_BUILD_DATE="${BUILD_DATE}"
ENV DATABASE_URL="sqlite:////data/nginxproxymanager.db" \
	DBMATE_MIGRATIONS_DIR="/app/migrations" \
	DBMATE_SCHEMA_FILE="/data/schema.sql" \
	DBMATE_NO_DUMP_SCHEMA="1"

LABEL org.label-schema.schema-version="1.0" \
	org.label-schema.license="MIT" \
	org.label-schema.name="nginx-proxy-manager" \
	org.label-schema.description="Nginx Host Management and Proxy" \
	org.label-schema.build-date="$NOW" \
	org.label-schema.version="$BUILD_VERSION" \
	org.label-schema.url="https://nginxproxymanager.com" \
	org.label-schema.vcs-url="https://github.com/jc21/nginx-proxy-manager.git" \
	org.label-schema.vcs-ref="$BUILD_COMMIT" \
	org.label-schema.cmd="docker run --rm -ti jc21/nginx-proxy-manager:$BUILD_VERSION"
