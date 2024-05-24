FROM caddy:2.8.1 as caddy

FROM alpine:3.20.0
RUN apk add --no-cache ca-certificates tzdata
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
