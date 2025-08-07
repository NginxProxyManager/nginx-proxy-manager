FROM alpine:3.22.1
RUN apk add --no-cache ca-certificates tzdata
COPY --from=caddy:2.10.2 /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
