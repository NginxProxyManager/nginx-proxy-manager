# Custom location semantics

Checks that the dynamic rendering of custom locations (upstream host in a variable, resolved by nginx per request)
answers exactly like the static rendering (literal upstream) and like the rendering used before dynamic locations
existed. The configs are produced by the real backend renderer (`backend/lib/nginx-locations.js` and
`backend/templates/_location.conf`).

- `cases.json`: the custom locations (path, forward path, optional host, advanced config, caching, access list)
- `reqs.txt`: the requests, one per line, `path`, `path|user:password` or `path|user:password|:port` (the port is
  added to the Host header, `path||:8443` without credentials)
- `echo.js`: the upstream, answers with the URI and the Host header it received and can redirect
- `gen.mjs`: writes the nginx config with three servers (legacy :8001, static :8002, dynamic :8003)
- `run.sh`: starts nginx, sends every request to the servers and compares status, `Location` and body. It also
  checks that the upstream got the Host the client sent, port included (`proxy_set_header Host $forward_host`, see
  `map $http_host $forward_host` in `docker/rootfs/etc/nginx/nginx.conf`). For cached assets that only holds when the
  cache key contains the port, so `/cache/app.css` with `:8443` and `:9443` must not share a cache entry.

Cases with caching or an access list are only compared between static and dynamic: caching inside a custom location
used to proxy assets to the host's main upstream, which was fixed on purpose.

## Running

Needs the backend dependencies (`yarn install` in `backend/`) and Docker:

```bash
docker network create npm-sem
docker run -d --name npm-sem-echo --network npm-sem --network-alias echo \
  -v "$PWD/test/nginx-semantics:/w:ro" nginxproxymanager/nginx-full:certbot-node node /w/echo.js
docker run --rm --network npm-sem \
  -v "$PWD/test/nginx-semantics:/w:ro" -v "$PWD/backend:/backend:ro" \
  nginxproxymanager/nginx-full:certbot-node bash /w/run.sh
docker rm -f npm-sem-echo && docker network rm npm-sem
```

The last line of the output is `COMPARISONS=<n> DIFFS=0` and the exit code is 0 when everything matches.
