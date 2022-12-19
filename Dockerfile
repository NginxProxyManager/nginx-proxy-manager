FROM zoeyvid/nginx-quic:29
COPY rootfs          /
COPY backend         /app
COPY global          /app/global
COPY frontend/dist   /app/frontend

WORKDIR /app
RUN echo https://dl-cdn.alpinelinux.org/alpine/edge/testing | tee -a /etc/apk/repositories && \
    apk upgrade --no-cache && \
    apk add --no-cache ca-certificates wget tzdata bash coreutils \
    python3 \
    nodejs-current npm \
    openssl apache2-utils jq fcgi \
    gcc g++ libffi-dev python3-dev \
    php7 php7-fpm php8 php8-fpm php81 php81-fpm php82 php82-fpm && \
    
# Install cross-env
    npm install --global cross-env && \
    
# Install pip
    wget https://bootstrap.pypa.io/get-pip.py -O - | python3 && \

# Change permission
    chmod +x /usr/local/bin/start && \
    chmod +x /usr/local/bin/check-health && \

# Build Backend
    sed -i "s/0.0.0/$(cat global/.version)/g" package.json && \
    npm install --force && \
    pip install --no-cache-dir certbot && \
    apk del --no-cache gcc g++ libffi-dev python3-dev npm

ENV NODE_ENV=production \
    DB_SQLITE_FILE=/data/database.sqlite
    
ENTRYPOINT ["bash", "start"]
HEALTHCHECK CMD check-health
