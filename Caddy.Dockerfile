FROM alpine:3.21.0
RUN apk add --no-cache ca-certificates tzdata
COPY --from=caddy:2.8.4 /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
