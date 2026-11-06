# Custom location semantics

Checks that the dynamic rendering of custom locations (upstream host in a variable, resolved by nginx per request)
answers exactly like the static rendering (literal upstream) and like the rendering used before dynamic locations
existed. The configs are produced by the real backend renderer (`backend/lib/nginx-locations.js` and
`backend/templates/_location.conf`).

- `cases.json`: the custom locations (path, forward path, optional host, advanced config, caching, access list)
- `reqs.txt`: the requests, one per line: `path|user:password|:port|expected|header`, everything but the path is
  optional (`path||:8443`). The port is added to the Host header, the expected text must be in the response (eg.
  `"url":"/api/42"`, the URI the upstream got, or `403`), the header is sent as it is (`X-Token: secret`)
- `echo.js`: the upstream, answers with the URI and the Host header it received and can redirect. On port 9001 it is
  the host's main upstream and adds `"upstream":"main"`
- `gen.mjs`: writes the nginx config with three servers for the cases without caching (legacy :8001, static :8002,
  dynamic :8003) and two hosts for the cases with caching (static :8012, dynamic :8013). These are rendered with the
  full host template `backend/templates/proxy_host.conf`, so they contain the host-level asset location
  (`conf.d/include/assets.conf`, proxied to the main upstream) before the custom locations, as in a real config
- `run.sh`: starts nginx, sends every request to the servers and compares status, `Location` and body. It also
  checks that the upstream got the Host the client sent, port included (`proxy_set_header Host $forward_host`, see
  `map $http_host $forward_host` in `docker/rootfs/etc/nginx/nginx.conf`). For cached assets that only holds when the
  cache key contains the port, so `/cache/app.css` with `:8443` and `:9443` must not share a cache entry. A response from the main upstream is a
  difference unless the request expects `"upstream":"main"`: the requests of a custom location, assets included,
  must reach that location's upstream.

Cases with caching or an access list are only compared between static and dynamic: caching inside a custom location
used to proxy assets to the host's main upstream, which was fixed on purpose. The cached cases also check that assets go through the
location's advanced config like every other request of it (a `return 403` guard, a `rewrite`, a `set` inside an
`if`, a nested `location` block, an access list): the nested asset location used to skip it. `/cinc/` and `/cincg/` include
snippets that `run.sh` writes (`/tmp/nginx-sem/snip/`): settings of the asset cache block, an `auth_request` and
nested locations (as Authelia's / authentik's snippets have them) and a rewrite-phase guard. The nested asset location
must pass `nginx -t` and inherit the included settings; the included guard does not apply to assets (documented, the
expectation says so). `/clua/` and `/csm/` have an include and a guard written directly in the advanced config
that reads a variable of `set_by_lua_block` / `set_if_empty` (set-misc): the asset location repeats those statements.
`/cstore/` and `/cstorei/` set `proxy_store` (without / with an include), which nginx doesn't allow next to the asset
block's `proxy_cache`. `/cluab/` and `/cluabi/` have an `access_by_lua_block` guard with `}` in a Lua comment and a Lua
table: read as Lua, not quarantined. `/credi/` includes a `proxy_redirect` and `/cref/` a `valid_referers` that is also written
directly in the advanced config: the asset location inherits both, the included entries too. `/rdoi/`, `/rdgi/` (nested include
through a glob), `/rdvi/` and `/crdoi/` include a `proxy_redirect off;` or a rule that matches nothing: the backend reads
the included file and the dynamic rendering adds no `proxy_redirect` line of its own (`off` next to it fails
`nginx -t`, another rule would replace nginx's default one).

## Running

Needs the backend dependencies (`yarn install` in `backend/`) and Docker:

```bash
docker network create npm-sem
docker run -d --name npm-sem-echo --network npm-sem --network-alias echo \
  -v "$PWD/test/nginx-semantics:/w:ro" nginxproxymanager/nginx-full:certbot-node node /w/echo.js
docker run --rm --network npm-sem \
  -v "$PWD/test/nginx-semantics:/w:ro" -v "$PWD/backend:/backend:ro" \
  -v "$PWD/docker/rootfs/etc/nginx/conf.d/include:/npm-include:ro" \
  nginxproxymanager/nginx-full:certbot-node bash /w/run.sh
docker rm -f npm-sem-echo && docker network rm npm-sem
```

The last line of the output is `COMPARISONS=<n> DIFFS=0` and the exit code is 0 when everything matches.
