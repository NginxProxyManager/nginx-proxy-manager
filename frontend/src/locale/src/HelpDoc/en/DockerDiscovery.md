## Docker discovery

Without any setup, the forward host field already suggests containers that share a Docker
network with Nginx Proxy Manager, and hosts you used before.

With **Docker discovery** switched on, NPM also reads the Docker API. The forward host field
then lists your containers with their ports and state. Picking a container with `npm.*`
labels fills in the free fields of a new proxy host: domain names, port, scheme and the
switches. Nothing you entered yourself is overwritten, and nothing is saved until you save.

### 1. Create a socket proxy container

Don't mount the Docker socket into NPM: access to it is root access to your server, and
`:ro` does not change that. Run a small proxy that only allows reading containers and
networks instead. With Compose or in your container manager's web UI:

1. Create a container from the image `tecnativa/docker-socket-proxy`, named for example
   `socket-proxy`.
2. Mount `/var/run/docker.sock` to `/var/run/docker.sock`, read-only.
3. Set the variables `CONTAINERS=1` and `NETWORKS=1`. Leave everything else at its default
   (denied).
4. Publish no ports. NPM reaches the proxy over a Docker network.
5. Put it on a network the NPM container is on (or create one and attach both).
6. Optional: give it the label `npm.hide=true`, so it isn't suggested as a forward host.

```yaml
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy
    restart: unless-stopped
    environment:
      CONTAINERS: 1
      NETWORKS: 1
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    labels:
      npm.hide: "true"
    networks:
      - socket-proxy

networks:
  socket-proxy:
    internal: true
```

Here NPM has to be attached to the `socket-proxy` network as well.

### 2. Set two variables on the NPM container

```
NPM_DOCKER_DISCOVERY=true
DOCKER_HOST=tcp://socket-proxy:2375
```

Use the name of your proxy container in `DOCKER_HOST`. Then restart (or recreate) the NPM
container.

### 3. Optional: labels on your containers

```yaml
labels:
  npm.domain: "app.example.com, www.app.example.com"
  npm.port: "8080"
  npm.scheme: "http"
  npm.websocket: "true"
```

- `npm.domain`: domain names, separated by commas or spaces
- `npm.port`: forward port
- `npm.scheme`: `http` or `https`
- `npm.websocket`: "Websockets Support"
- `npm.block_exploits`: "Block Common Exploits"
- `npm.caching`: "Cache Assets"
- `npm.http2`: "HTTP/2 Support", turned on once you pick a certificate
- `npm.hide`: never suggest this container (also not in the network scan, as long as Docker
  discovery works)

Switches take `true` or `false`. Docker reads labels when a container is created, so
recreate the container after changing them, then refresh the suggestions.

The domain names are only filled in when the field is still empty. If another host already
uses one of them, the container is marked in the list and the domains are left out.

### Troubleshooting

If discovery doesn't work, the suggestion list shows the reason. "Connection to the Docker API
was refused" means nothing answers at the address in `DOCKER_HOST` (is the proxy running, on port
2375?); "The DOCKER_HOST host name could not be resolved" means NPM and the proxy don't share a
network, or the name in `DOCKER_HOST` is wrong. "The Docker API
denied the request" means the proxy needs `CONTAINERS=1` and `NETWORKS=1`. If you mount the
socket itself and set `PUID`/`PGID`, NPM usually can't open it; the proxy avoids that.

More details: [Upstream Discovery](https://nginxproxymanager.com/advanced-config/upstream-discovery)
