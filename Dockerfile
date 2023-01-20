FROM zoeyvid/nginx-quic:51
COPY rootfs          /
COPY backend         /app
COPY global          /app/global
COPY frontend/dist   /app/frontend

WORKDIR /app
RUN apk upgrade --no-cache && \
    apk add --no-cache ca-certificates wget tzdata \
    python3 nodejs-current npm \
    gcc g++ libffi-dev python3-dev \
    grep coreutils jq openssl apache2-utils && \
# Install cross-env
    npm install --global cross-env && \
# Install pip
    wget https://bootstrap.pypa.io/get-pip.py -O - | python3 && \
# Change permission
    chmod +x /bin/start.sh && \
    chmod +x /bin/check-health.sh && \
# Build Backend
    sed -i "s|\"0.0.0\"|\""$(cat global/.version)"\"|g" package.json && \
    npm install --force && \
# Install Certbot
    pip install --no-cache-dir certbot && \
# Clean
    apk del --no-cache npm gcc g++ libffi-dev python3-dev

ENV NODE_ENV=production \
    DB_SQLITE_FILE=/data/database.sqlite
    
ENTRYPOINT ["start.sh"]
HEALTHCHECK CMD check-health.sh