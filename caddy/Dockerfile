FROM alpine:3.23.3
RUN apk add --no-cache tzdata
COPY --from=caddy:2.11.1 /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
