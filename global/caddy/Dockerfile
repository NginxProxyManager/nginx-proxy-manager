FROM alpine:3.22.0
RUN apk add --no-cache ca-certificates tzdata
COPY --from=caddy:2.10.0 /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
