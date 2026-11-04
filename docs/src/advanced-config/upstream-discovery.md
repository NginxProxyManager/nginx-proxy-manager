---
outline: deep
---

# Upstream Discovery & Checks

When you type a forward host for a proxy host, a custom location or a stream, Nginx Proxy Manager can
suggest hosts it can see, check that the host you typed resolves and accepts connections, and keep
checking the upstreams of your enabled hosts in the background.

None of this changes your nginx configuration. Suggestions and check results are only there to help
you enter the right value.

## Where suggestions come from

Suggestions come from up to three sources. When the same host shows up in more than one, the entry
from the first source in this list wins and the known ports are merged.

| Source | Default | Needs | What it gives you |
|---|---|---|---|
| Docker containers | off | Docker API access (see below) | Container names, Compose service names, exposed ports, state, network |
| Discovered on network | on | NPM on a user-defined Docker network | Names of containers that share a network with NPM (no ports) |
| Used before | on | nothing | Forward hosts and ports already used by hosts you can see |

### Used before

This source lists the forward hosts of your proxy hosts, their custom locations and your streams,
with the ports they use and how many hosts use them. It follows your permissions: a user with
"visibility: user" only gets the hosts they own.

### Discovered on network (Docker embedded DNS)

On a [user-defined Docker network](./index.md#best-practice-use-a-docker-network), Docker runs a DNS
server inside every container at `127.0.0.11`. For each container on the network, it answers reverse
(PTR) lookups with `<container-name>.<network-name>`.

NPM uses this to find its neighbours **without the Docker socket**:

- It looks up the addresses of its own IPv4 subnets, starting from the network base and counting up,
  because Docker hands out addresses in order.
- It skips its own address and the gateway.
- It stops after 32 addresses in a row without an answer, after 1024 addresses, or after 5 seconds,
  whichever comes first.
- It keeps a name only if looking that name up again returns the same address.

Results are cached for 30 seconds.

This needs no extra permissions, but it only finds containers that share a network with NPM, and it
can't tell you which ports they listen on. On the default `bridge` network, or outside Docker, the
dropdown says that this source is unavailable.

Disable it with `NPM_DNS_DISCOVERY=false`.

### Docker containers (Docker API)

With Docker discovery switched on, NPM asks the Docker Engine API which containers share a network
with it. You get their names, their Compose service names, their exposed (not only published) TCP
ports and their state.

NPM only ever sends `GET` requests, and only to `/version`, `/containers/json`,
`/containers/{id}/json` and `/networks/{id}`. From the answers it keeps only names, ports, state,
network and IP address. Environment variables, mounts, commands and labels outside the `npm.`
namespace are never stored or returned.

Requests time out after 3 seconds and answers are capped at 2 MB. Results are cached for 30 seconds.

#### Labels

You can add these labels to your own containers to improve the suggestions:

| Label | Example | Effect |
|---|---|---|
| `npm.port` | `npm.port=8080` | Port that is filled in when you pick the container |
| `npm.scheme` | `npm.scheme=https` | Scheme that is filled in when you pick the container |
| `npm.hide` | `npm.hide=true` | Never suggest this container |

Without `npm.port`, the port is filled in only when the container exposes exactly one TCP port.

#### Recommended setup: docker-socket-proxy

::: danger Docker socket access is root access
Anyone who can talk to the Docker API can start a privileged container and take over the host.
**Mounting `/var/run/docker.sock` with `:ro` does not change that.** `:ro` only stops the socket
*file* from being replaced. API calls, including ones that create and start containers, still work.
:::

Don't give NPM the socket itself. Put [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy)
in front of it and allow only the read-only container and network endpoints:

```yml
services:
  app:
    image: 'jc21/nginx-proxy-manager:{{VERSION}}'
    restart: unless-stopped
    environment:
      NPM_DOCKER_DISCOVERY: 'true'
      DOCKER_HOST: 'tcp://socket-proxy:2375'
    networks:
      - default
      - socket-proxy
    # ... ports, volumes, etc.

  socket-proxy:
    image: 'tecnativa/docker-socket-proxy'
    restart: unless-stopped
    environment:
      CONTAINERS: 1
      NETWORKS: 1
      # Everything else, including POST, stays at its default of 0 (denied)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - socket-proxy

networks:
  socket-proxy:
    internal: true
```

The `socket-proxy` network is `internal`, so only containers you attach to it can reach the proxy,
and the proxy can't reach the internet.

This setup also avoids a permission problem. When you set `PUID`/`PGID`, the backend runs without
supplementary groups, so it usually can't open a mounted socket that belongs to the `docker` group.
TCP to the proxy has no such limit.

If you decide to mount the socket anyway, `DOCKER_HOST` defaults to `unix:///var/run/docker.sock`.
Podman's Docker-compatible socket works too, for example `DOCKER_HOST=unix:///run/podman/podman.sock`.
TLS (`tcp://` with certificates) is not supported.

If something is wrong, the dropdown shows the reason. For example, "permission denied on the Docker
socket", "connection refused", or "the Docker API denied the request", which means the proxy needs
`CONTAINERS=1` and `NETWORKS=1`.

## Reachability check

When you stop typing a forward host and port, the form checks the target and shows a badge. The
check:

1. Strips a path, if there is one (`app/api/` checks `app`). Then it rejects host names with
   characters such as spaces, `;`, `{`, `}` or quotes.
2. Resolves the name in two ways:
   - **System view**: the operating system's resolver, which includes `/etc/hosts`, Docker
     `extra_hosts` and `resolv.conf` search domains.
   - **nginx resolver view**: the DNS servers in nginx's `resolver` directive
     (`/etc/nginx/conf.d/include/resolvers.conf`). nginx uses these to resolve names at request time,
     and they do **not** read `/etc/hosts` or search domains.
3. Opens a TCP connection to the first address and closes it straight away. Nothing is sent, and
   nothing the upstream sends back is read or returned.

| Result | Meaning |
|---|---|
| `ok` | Resolved and accepted a connection |
| `resolver_mismatch` | Reachable, but the name only resolves through `/etc/hosts` or a search domain. It works only when NPM renders this upstream statically (resolved once, when the configuration loads); requests through nginx's resolver would fail. Use the full DNS name or the container name instead. |
| `dns_not_found` | Neither resolver knows the name. Check the spelling, and that the container is running and on the same network. |
| `dns_timeout` | No DNS server answered in time |
| `tcp_refused` | The host exists, but nothing listens on that port |
| `tcp_timeout` | No answer within 3 seconds (often a firewall dropping traffic) |
| `tcp_unreachable` | No route to the host |
| `invalid_host` | Not a valid host name, IP address or port |
| `disabled` | Checks are switched off with `NPM_UPSTREAM_CHECK=false` |

The check only covers TCP. A green badge for a stream that forwards UDP says nothing about the UDP
service.

## Background health monitor

Every `NPM_UPSTREAM_HEALTH_INTERVAL` seconds (default 60), NPM runs the same check against every
target that is enabled:

- the main forward host of each proxy host,
- each enabled custom location,
- the forward host of each stream that forwards TCP.

Identical host and port pairs are checked once per round, eight at a time. Results are kept in
memory only; they are never written to the database and are gone after a restart. The host lists
use them to show an amber "upstream unreachable" status. That is separate from the red status for a
configuration nginx rejected.

Set `NPM_UPSTREAM_HEALTH_INTERVAL=0` to switch the monitor off. Values below 10 are raised to 10
seconds. `NPM_UPSTREAM_CHECK=false` switches it off as well.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NPM_DNS_DISCOVERY` | `true` | Suggest containers found through Docker's embedded DNS |
| `NPM_DOCKER_DISCOVERY` | `false` | Suggest containers from the Docker API (`DOCKER_HOST`) |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker API address: `unix:///path/to/socket` or `tcp://host:port` |
| `NPM_UPSTREAM_CHECK` | `true` | Allow reachability checks (form badges and health monitor) |
| `NPM_UPSTREAM_HEALTH_INTERVAL` | `60` | Seconds between health monitor rounds; `0` turns it off |

`NPM_LOCATION_DYNAMIC_DNS` (whether custom locations resolve their host at request time) and
`NPM_RECONCILE_ON_START` (startup repair of host configurations) are covered on the custom locations
page.

## Permissions and limits

- Suggestions and checks are available to administrators and to users who may **manage** proxy
  hosts or streams.
- Health results are available to users who may **view** proxy hosts or streams. They only include
  hosts that user can see.
- Each user can check up to 60 targets per minute and force-refresh the suggestions 6 times per
  minute. Beyond that, the API answers `429 Too Many Requests` with a `Retry-After` header.
- Checks and discovery are logged at debug level only.

Anyone who can manage proxy hosts can already point nginx at any address NPM can reach, so the check
doesn't grant new access. The rate limits keep it from being used as a fast port scanner.

## API

| Endpoint | Description |
|---|---|
| `GET /api/upstreams/candidates?refresh=true` | Suggestions with the status of each source; `refresh=true` bypasses the 30 second cache |
| `POST /api/upstreams/check` | Check up to 20 targets: `{"targets": [{"host": "app", "port": 8080, "scheme": "http"}]}` |
| `GET /api/upstreams/health` | Latest health monitor results per proxy host and stream |

The full request and response schemas are in the API documentation (`/api/schema`).
