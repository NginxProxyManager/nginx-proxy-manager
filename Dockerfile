FROM --platform="$BUILDPLATFORM" alpine:3.17.3 as frontend
COPY global   /build/global
COPY frontend /build/frontend
ARG NODE_ENV=production \
    NODE_OPTIONS=--openssl-legacy-provider
RUN apk add --no-cache ca-certificates nodejs yarn git python3 build-base && \
    cd /build/frontend && \
    sed -i "s|\"0.0.0\"|\""$(cat ../global/.version)"\"|g" package.json && \
    yarn --no-lockfile install && \
    yarn --no-lockfile build && \
    yarn cache clean --all
COPY security.txt /build/frontend/dist/.well-known/security.txt


FROM --platform="$BUILDPLATFORM" alpine:3.17.3 as backend
COPY backend /build/backend
COPY global  /build/backend/global
ARG NODE_ENV=production \
    TARGETARCH
RUN apk add --no-cache ca-certificates nodejs-current yarn && \
    wget https://gobinaries.com/tj/node-prune -O - | sh && \
    cd /build/backend && \
    sed -i "s|\"0.0.0\"|\""$(cat global/.version)"\"|g" package.json && \
    if [ "$TARGETARCH" = "amd64" ]; then \
    npm_config_target_platform=linux npm_config_target_arch=x64 yarn install --no-lockfile; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
    npm_config_target_platform=linux npm_config_target_arch=arm64 yarn install --no-lockfile; \
    fi && \
    node-prune && \
    yarn cache clean --all

FROM python:3.11.3-alpine3.17 as certbot
RUN apk add --no-cache build-base libffi-dev && \
    python3 -m venv /usr/local/certbot && \
    . /usr/local/certbot/bin/activate && \
    pip install --no-cache-dir certbot

FROM zoeyvid/nginx-quic:112
RUN apk add --no-cache ca-certificates tzdata \
    nodejs-current \
    openssl apache2-utils \
    coreutils grep jq curl shadow sudo

COPY                 rootfs               /
COPY --from=backend  /build/backend       /app
COPY --from=frontend /build/frontend/dist /app/frontend
COPY --from=certbot  /usr/local/certbot   /usr/local/certbot

RUN ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js && \
    ln -s /app/index.js /usr/local/bin/index.js

ENV NODE_ENV=production \
    NODE_CONFIG_DIR=/data/etc/npm \
    PATH="/usr/local/certbot/bin:$PATH" \
    DB_SQLITE_FILE=/data/etc/npm/database.sqlite

WORKDIR /app
ENTRYPOINT ["start.sh"]
HEALTHCHECK CMD check-health.sh
