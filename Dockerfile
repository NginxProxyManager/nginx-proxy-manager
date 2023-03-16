FROM --platform="$BUILDPLATFORM" alpine:3.17.2 as frontend
COPY global   /build/global
COPY frontend /build/frontend
RUN apk upgrade --no-cache && \
    apk add --no-cache ca-certificates tzdata \
    nodejs yarn git build-base python3
ARG NODE_ENV=production \
    NODE_OPTIONS=--openssl-legacy-provider
RUN cd /build/frontend && \
    sed -i "s|\"0.0.0\"|\""$(cat ../global/.version)"\"|g" package.json && \
    yarn --no-lockfile install && \
    yarn --no-lockfile build
COPY security.txt /build/frontend/dist/.well-known/security.txt


FROM --platform="$BUILDPLATFORM" alpine:3.17.2 as backend
COPY backend /build/backend
COPY global  /build/backend/global
RUN apk upgrade --no-cache && \
    apk add --no-cache ca-certificates tzdata \
    nodejs-current yarn && \
    wget https://gobinaries.com/tj/node-prune -O - | sh
ARG NODE_ENV=production \
    TARGETARCH
RUN cd /build/backend && \
    sed -i "s|\"0.0.0\"|\""$(cat global/.version)"\"|g" package.json && \
    if [ "$TARGETARCH" = "amd64" ]; then \
    npm_config_target_platform=linux npm_config_target_arch=x64 yarn install --no-lockfile; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
    npm_config_target_platform=linux npm_config_target_arch=arm64 yarn install --no-lockfile; \
    fi && \
    node-prune


FROM zoeyvid/nginx-quic:87
RUN apk upgrade --no-cache && \
    apk add --no-cache ca-certificates tzdata \
    nodejs-current \
    openssl apache2-utils \
    coreutils grep jq curl \
    build-base libffi-dev && \
# Install Certbot
    pip install --no-cache-dir certbot && \
# Clean
    apk del --no-cache build-base libffi-dev

COPY                 rootfs               /
COPY --from=backend  /build/backend       /app
COPY --from=frontend /build/frontend/dist /app/frontend

RUN ln -s /app/password-reset.js /usr/local/bin/password-reset.js && \
    ln -s /app/sqlite-vaccum.js /usr/local/bin/sqlite-vaccum.js

ENV NODE_ENV=production \
    DB_SQLITE_FILE=/data/database.sqlite

WORKDIR /app
ENTRYPOINT ["start.sh"]
HEALTHCHECK CMD check-health.sh
