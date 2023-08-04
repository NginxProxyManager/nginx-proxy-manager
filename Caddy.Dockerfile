FROM caddy:2.7.2
RUN apk add --no-cache ca-certificates tzdata
COPY Caddyfile /etc/caddy/Caddyfile
