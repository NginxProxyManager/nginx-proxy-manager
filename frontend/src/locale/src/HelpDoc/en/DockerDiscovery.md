## Docker discovery

Without any setup, the forward host field already suggests containers that share a Docker
network with Nginx Proxy Manager, and hosts you used before.

With **Docker discovery** switched on, NPM also reads the Docker API. You then get exposed
ports, container state, and **From Docker** on the Proxy Hosts page, which creates a proxy
host from a container's `npm.*` labels.

### 1. Give NPM read access to the Docker API

Don't mount the Docker socket into NPM directly: access to it is root access to your server,
and `:ro` does not change that. Run a small proxy that only allows reading containers and
networks instead:

```yaml
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy
    restart: unless-stopped
    environment:
      CONTAINERS: 1
      NETWORKS: 1
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - socket-proxy

networks:
  socket-proxy:
    internal: true
```

Attach the NPM container to the `socket-proxy` network as well.

### 2. Set two environment variables on the NPM container

```
NPM_DOCKER_DISCOVERY=true
DOCKER_HOST=tcp://socket-proxy:2375
```

On Unraid, add both as variables in the NPM container template and put both containers on
the same custom network. Then restart the NPM container.

### 3. Optional: labels on your containers

```yaml
labels:
  npm.domain: "app.example.com"
  npm.port: "8080"
  npm.scheme: "http"
  npm.websocket: "true"
```

Other labels: `npm.block_exploits`, `npm.caching`, `npm.http2` (true/false) and
`npm.hide=true` to leave a container out.

### Troubleshooting

If discovery doesn't work, the suggestion list shows the reason. "Connection refused" means
NPM can't reach the proxy (same network?). "The Docker API denied the request" means the
proxy needs `CONTAINERS=1` and `NETWORKS=1`. If you mount the socket itself and set
`PUID`/`PGID`, NPM usually can't open it; the proxy avoids that.
