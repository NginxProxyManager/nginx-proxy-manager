FROM alpine:3.21.3
RUN apk add --no-cache ca-certificates tzdata
COPY --from=caddy:2.9.1 /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
