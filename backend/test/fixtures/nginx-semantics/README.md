# Custom location semantics fixtures

Fixtures of `backend/test/nginx-semantics.test.js`, an opt-in test against a real nginx. It checks that the dynamic
rendering of custom locations (upstream host in a variable, resolved by nginx per request) answers exactly like the
static rendering (literal upstream) and like the rendering used before dynamic locations existed. The configs are
produced by the real backend renderer (`backend/lib/nginx-locations.js`, `backend/templates/_location.conf`).

- `cases.json`: the custom locations (path, forward path `fp`, optional `host`, advanced config `adv`, `cache`, `acl`)
- `requests.json`: the requests. Each has a `path` and optionally `auth` (`user:password`), `hostPort` (added to the
  Host header, eg. `:8443`), `upperHost` (sends the host name in upper case), `expect` (text that must be in the
  response, eg. `"url":"/api/42"`, the URI the upstream got, or `403`) and `header` (sent as it is, `X-Token: secret`).
  `cachedHost` lists the first path segments served by the hosts with caching, `skipLegacy` the others that are not
  compared with the legacy rendering
- `snippets.json`: files the advanced configs include, written to `/tmp/nginx-sem/snip/` (one string per line)
- `backend/test/support/nginx-semantics-echo.js`: the upstream, answers with the URI and the Host header it received
  and can redirect. On port 9001 it is the host's main upstream and adds `"upstream":"main"`

The test renders one nginx config with three servers for the cases without caching (legacy :8001, static :8002,
dynamic :8003) and two hosts for the cases with caching (static :8012, dynamic :8013). These are rendered with the
full host template `backend/templates/proxy_host.conf`, so they contain the host-level asset location
(`conf.d/include/assets.conf`, proxied to the main upstream) before the custom locations, as in a real config. It
sends every request to the servers and compares status, `Location`, `X-Sem-*` headers and body. It also checks that
the upstream got the Host the client sent, port included, in lower case as nginx's `$host`
(`proxy_set_header Host $forward_host`, see `map "$host|$http_host" $forward_host` in
`docker/rootfs/etc/nginx/conf.d/include/proxy-variables.conf`, which the generated config includes). For cached
assets that only holds when the cache key contains the port, so `/cache/app.css` with `:8443` and `:9443` must not
share a cache entry. A response from the main upstream is a difference unless the request expects
`"upstream":"main"`: the requests of a custom location, assets included, must reach that location's upstream.

Cases with caching or an access list are only compared between static and dynamic: caching inside a custom location
used to proxy assets to the host's main upstream, which was fixed on purpose. The cached cases also check that assets go through the
location's advanced config like every other request of it (a `return 403` guard, a `rewrite`, a `set` inside an
`if`, a nested `location` block, an access list): the nested asset location used to skip it. `/cinc/` and `/cincg/` include
the snippets of `snippets.json`, which the test writes to `/tmp/nginx-sem/snip/`: settings of the asset cache block, an `auth_request` and
nested locations (as Authelia's / authentik's snippets have them) and a rewrite-phase guard. The nested asset location
must pass `nginx -t` and inherit the included settings; the rewrite-phase statements of the included files (the
guard of `/cincg/`) are copied into it, so they stop asset requests too. `/crwg/` has a guard after a `rewrite` of its own
and a forward path: the asset copy's guard must read the rewritten `$uri`. `/clua/` and `/csm/` have an include and a guard written directly in the advanced config
that reads a variable of `set_by_lua_block` / `set_if_empty` (set-misc): the asset location repeats those statements.
`/cstore/` and `/cstorei/` set `proxy_store` (without / with an include), which nginx doesn't allow next to the asset
block's `proxy_cache`. `/cluab/` and `/cluabi/` have an `access_by_lua_block` guard with `}` in a Lua comment and a Lua
table: read as Lua, not quarantined. `/credi/` includes a `proxy_redirect` and `/cref/` a `valid_referers` that is also written
directly in the advanced config: the asset location inherits both, the included entries too. `/rdoi/`, `/rdgi/` (nested include
through a glob), `/rdvi/` and `/crdoi/` include a `proxy_redirect off;` or a rule that matches nothing: the backend reads
the included file and the dynamic rendering adds no `proxy_redirect` line of its own (`off` next to it fails
`nginx -t`, another rule would replace nginx's default one).
`/curi/` (Cache Assets, forward path, `proxy_set_header X-Sem-In $uri;`) checks that an asset request still sends the
location's own path in that header, although the nested asset location rewrites the URI.
`/varmix/`, `/varmixfp/` and `/vmrx/` have a forward host that combines text and a variable (`ec$semhost`, saved before
v2.17): written literally like `/var/`, as the rendering before dynamic locations did.

## Running

Skipped in a plain `yarn test`. It needs the backend dependencies (`yarn install` in `backend/`) and runs in a
throwaway container of the nginx-full image, on its own network where `echo` is the container itself. From the
repository root:

```bash
docker network create npm-sem
docker run --rm --network npm-sem --network-alias echo -v "$PWD:/repo" -w /repo/backend -e NPM_TEST_NGINX=1 \
  nginxproxymanager/nginx-full:certbot-node node --test test/nginx-semantics.test.js
docker network rm npm-sem
```

Each request is one test, named `path|user:password|:port|expected|header`; a difference fails it with the
responses of both renderings. The last test reports `COMPARISONS=<n> DIFFS=<m>` and lists every difference.
