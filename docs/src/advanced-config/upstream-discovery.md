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
network, IP address and the `npm.*` labels below. Environment variables, mounts, commands and labels
outside the `npm.` namespace are never stored or returned.

Requests time out after 3 seconds and answers are capped at 2 MB. Results are cached for 30 seconds.

#### Labels

You can add these labels to your own containers. When you pick a labelled container in the forward
host field of a proxy host, they fill in the rest of the form:

| Label | Example | Effect |
|---|---|---|
| `npm.domain` | `npm.domain=app.example.com, www.app.example.com` | Domain names of the proxy host (comma and/or space separated) |
| `npm.port` | `npm.port=8080` | Forward port |
| `npm.scheme` | `npm.scheme=https` | Forward scheme |
| `npm.websocket` | `npm.websocket=true` | Turns on "Websockets Support" |
| `npm.block_exploits` | `npm.block_exploits=true` | Turns on "Block Common Exploits" |
| `npm.caching` | `npm.caching=true` | Turns on "Cache Assets" |
| `npm.http2` | `npm.http2=true` | Turns on "HTTP/2 Support" as soon as you pick a certificate in the form (HTTP/2 needs one, so it stays off without) |
| `npm.hide` | `npm.hide=true` | Never suggest this container, also not through DNS discovery (see below) |

`npm.hide` needs Docker discovery: DNS discovery can't read labels, so it leaves out the names and
addresses Docker discovery reports as hidden. With DNS discovery alone, or while Docker discovery
is unavailable, a hidden container can still be suggested; turn DNS discovery off
(`NPM_DNS_DISCOVERY=false`) or keep the container on a network NPM isn't on.

Without `npm.port`, the port is filled in only when the container exposes exactly one TCP port.
Without `npm.scheme`, the scheme is `https` for port 443 and 8443, otherwise `http`.

Invalid values are ignored rather than rejected: `true`/`false` also accept `1`/`0`, `yes`/`no` and
`on`/`off`; anything else counts as not set. Domain names that the domain field would refuse are
dropped from `npm.domain`, and the dropdown shows them under the container. A wildcard is accepted
only in front: `*.example.com` works, `*.com` and `www.example.*` don't. A wildcard host needs a DNS
challenge certificate if you want HTTPS; pick it in the form.

```yaml
services:
  whoami:
    image: traefik/whoami
    networks: [npm_default]  # a network Nginx Proxy Manager is on
    labels:
      npm.domain: "whoami.example.com, www.whoami.example.com"
      npm.port: "80"
      npm.scheme: "http"
      npm.websocket: "true"
      npm.block_exploits: "true"

networks:
  npm_default:
    external: true
```

#### Picking a labelled container

In the forward host field, the **Docker containers** group lists each container with its ports and
state. For a proxy host it also shows the domains of the container's `npm.domain` label. Picking a
container fills in only fields that are still free; nothing you entered yourself is overwritten:

- **Port and scheme**: when empty, when they still hold the saved value, or when an earlier pick
  filled them in. This works the same for custom locations and streams.
- **Domain names**: on a new proxy host, when the field is still empty (or still holds what an
  earlier pick filled in).
- **Websockets, Block Common Exploits, Cache Assets**: on a new proxy host, as long as you haven't
  changed these switches yourself. `npm.http2` turns HTTP/2 on once you pick a certificate.

When you edit an existing host, picking a container changes only the target (host, and port and
scheme as above), never its domain names or switches.

If a host you can see already uses one of the domains, the container is marked **domain in use** in
the dropdown, and picking it fills in the target but not the domain names. A hint under the domain
names says which kind of host has them and offers to open it: for a proxy host you can usually
edit that one instead, a redirection host or a 404 host has to be changed (or removed) first,
since two hosts can't share a domain name. A host you can't see (other users'
hosts, when you only see your own) still blocks the domain; saving then fails with "_domain_ is
already in use".

NPM never creates or changes hosts by itself because of labels; they are only read to fill in the
form, and nothing is saved until you save.

#### Labels on existing containers

Docker reads labels when a container is created; they can't be changed on a running container.
Add or change them in your compose file and run `docker compose up -d`, or recreate the container
with the labels set (in a container web UI: edit the container, add the labels, and save or
redeploy it, which recreates it). Then use the refresh button in the forward host dropdown.

#### Setting up Docker access: socket proxy

::: danger Docker socket access is root access
Anyone who can talk to the Docker API can start a privileged container and take over the host.
**Mounting `/var/run/docker.sock` with `:ro` does not change that.** `:ro` only stops the socket
*file* from being replaced. API calls, including ones that create and start containers, still work.
:::

Don't give NPM the socket itself. Put a socket proxy such as
[docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) in front of it and allow
only the read-only container and network endpoints. NPM reaches it over a Docker network; the proxy
publishes no ports.

##### With Docker Compose

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
      - /var/run/docker.sock:/var/run/docker.sock:ro
    labels:
      npm.hide: 'true'  # don't suggest the proxy itself as a forward host
    networks:
      - socket-proxy

networks:
  socket-proxy:
    internal: true
```

The `socket-proxy` network is `internal`, so only containers you attach to it can reach the proxy,
and the proxy can't reach the internet.

##### With `docker run`

The same setup without Compose. `npm` stands for the name of your NPM container:

```bash
docker network create --internal socket-proxy

docker run -d --name socket-proxy --restart unless-stopped \
  --network socket-proxy \
  -e CONTAINERS=1 -e NETWORKS=1 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  --label npm.hide=true \
  tecnativa/docker-socket-proxy

# attach NPM to the proxy's network as a second network
docker network connect socket-proxy npm
```

Then add `NPM_DOCKER_DISCOVERY=true` and `DOCKER_HOST=tcp://socket-proxy:2375` to the NPM container.
Environment variables can't be changed on an existing container, so recreate it with the same
volumes, ports and networks plus the two variables (`docker run -e ...`), then connect it to the
`socket-proxy` network again if you recreated it with `docker run`.

##### In a container web UI

Most container managers with a web UI have the same settings under similar names:

1. Create a network for the proxy (an "internal" one if the UI offers that), or use a custom
   network NPM is already on.
2. Add a container from the image `tecnativa/docker-socket-proxy`, named for example `socket-proxy`:
   - a volume or path mapping from `/var/run/docker.sock` on the host to `/var/run/docker.sock` in
     the container, read-only,
   - the variables `CONTAINERS=1` and `NETWORKS=1`,
   - no published ports (remove any the template suggests),
   - the network from step 1,
   - optionally the label `npm.hide=true`.
3. Edit the NPM container: add the variables `NPM_DOCKER_DISCOVERY=true` and
   `DOCKER_HOST=tcp://socket-proxy:2375` (with the name from step 2), and add the network from step
   1 as an additional network if NPM isn't on it yet.
4. Save or redeploy the NPM container, so it restarts with the new settings.

If the UI only allows one network per container, put both containers on the same custom network
instead.

##### Alternative image: linuxserver/socket-proxy

[linuxserver/socket-proxy](https://docs.linuxserver.io/images/docker-socket-proxy/) works the same
way, with the same variables, and also listens on port 2375 inside the container. It is meant to run
with a read-only root file system:

```bash
docker run -d --name socket-proxy --restart unless-stopped \
  --network socket-proxy \
  --read-only --tmpfs /run \
  -e CONTAINERS=1 -e NETWORKS=1 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  --label npm.hide=true \
  lscr.io/linuxserver/socket-proxy
```

In Compose: `read_only: true` and `tmpfs: [/run]`.

##### Mounting the socket directly

The proxy also avoids a permission problem. When you set `PUID`/`PGID`, the backend runs without
supplementary groups, so it usually can't open a mounted socket that belongs to the `docker` group.
TCP to the proxy has no such limit.

If you decide to mount the socket anyway, `DOCKER_HOST` defaults to `unix:///var/run/docker.sock`.
Podman's Docker-compatible socket works too, for example `DOCKER_HOST=unix:///run/podman/podman.sock`.
TLS (`tcp://` with certificates) is not supported.

#### Checking that it works

Open a proxy host (or add one), click into the forward host field and look at the dropdown:

- A **Docker containers** group with your containers, their ports and their state (`running`,
  `exited`, ...) means Docker discovery works. Containers with `npm.hide=true`, such as the socket
  proxy, are not listed.
- Without that group, the footer of the dropdown says why: "Docker discovery is off" means
  `NPM_DOCKER_DISCOVERY` isn't `true` on the NPM container (was it recreated?); otherwise it shows
  the error, see below.
- The footer always links the in-app help with the label reference; on a proxy host, so does the
  help icon next to "Forward Hostname / IP".

#### Troubleshooting

| Message in the dropdown | Cause |
|---|---|
| Docker discovery is off | `NPM_DOCKER_DISCOVERY=true` isn't set, or the container wasn't restarted (recreated) after setting it |
| Connection to the Docker API was refused | NPM reaches the address in `DOCKER_HOST` but nothing answers there: is the proxy running, is the port 2375? |
| The DOCKER_HOST host name could not be resolved | NPM and the proxy don't share a network, or `DOCKER_HOST` doesn't use the proxy's container name |
| The Docker API denied the request | The proxy blocks the request: set `CONTAINERS=1` and `NETWORKS=1` on it |
| Permission denied on the Docker socket | The socket is mounted into NPM directly and NPM can't open it (see `PUID`/`PGID` above); use the proxy |
| Docker API did not answer within 3 seconds | Something accepts the connection but doesn't answer, or a firewall drops the traffic |
| Docker API answered _status_ for _path_ | The proxy (or the Docker API) refused or failed that request with another HTTP status |
| Docker API response is too large | More than 2 MB of container list: too many containers on NPM's networks |
| Could not find Nginx Proxy Manager's own container through the Docker API ... | NPM can't find its own container in the list (needed to know its networks): the proxy filters it out, or NPM doesn't run in a container of this Docker host |
| DOCKER_HOST "..." is not supported / has an invalid port | `DOCKER_HOST` has a typo; use `tcp://<proxy-name>:2375` (TLS isn't supported) |
| Other text, such as `connect EHOSTUNREACH ...` | The network error as the system reports it, for example no route to the proxy's address |
| Docker discovery failed: ... | An unexpected error; the text after the colon says more |

A container you expect is missing: check that it shares a network with NPM, that it doesn't have
`npm.hide=true`, and use the refresh button (results are cached for 30 seconds). New or changed
labels need a recreated container.

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
| `resolver_mismatch` | Reachable, but the name only resolves through `/etc/hosts` or a search domain. It works only when NPM renders this upstream statically (resolved once, when the configuration loads); requests through nginx's resolver would fail. NPM always resolves a proxy host's main destination through nginx's resolver, and a custom location in dynamic mode or with a variable forward path (`/api/$arg_id`) too, so for those the result is shown as a warning and the health monitor counts it as unhealthy. Use the full DNS name or the container name instead. |
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
- Each user can check up to 60 targets per minute (the targets checked by **Test** in a host's dialog
  count too) and force-refresh the suggestions 6 times per
  minute. Beyond that, the API answers `429 Too Many Requests` with a `Retry-After` header.
- Checks and discovery are logged at debug level only.

Anyone who can manage proxy hosts can already point nginx at any address NPM can reach, so the check
doesn't grant new access. The rate limits keep it from being used as a fast port scanner.

## API

| Endpoint | Description |
|---|---|
| `GET /api/upstreams/candidates?refresh=true` | Suggestions with the status of each source; `refresh=true` bypasses the 30 second cache. Docker containers carry a `suggestion` built from their labels (what picking the container fills in), with `existing_host_id`/`existing_host_type` set when a host you can see already uses one of its domains |
| `POST /api/upstreams/check` | Check up to 20 targets: `{"targets": [{"host": "app", "port": 8080, "scheme": "http"}]}` |
| `GET /api/upstreams/health` | Latest health monitor results per proxy host and stream |

The full request and response schemas are in the API documentation (`/api/schema`).
