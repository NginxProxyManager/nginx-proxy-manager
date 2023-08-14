FROM caddy:2.7.3
RUN apk add --no-cache ca-certificates tzdata
COPY Caddyfile /etc/caddy/Caddyfile
