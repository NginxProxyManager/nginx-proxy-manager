#!/bin/bash
# Compares the responses of the legacy, static and dynamic rendering of custom locations.
# Runs inside the nginx-full base image, see README.md. Exits 1 when any response differs.
#
#   /w            this folder
#   /backend      the backend folder, with node_modules installed
#   /npm-include  docker/rootfs/etc/nginx/conf.d/include (assets.conf, proxy.conf for the cached hosts)
#   a host "echo" serving echo.js on ports 9000 and 9001, reachable through the docker resolver 127.0.0.11

set -euo pipefail

mkdir -p /var/log/nginx /var/cache/nginx /data/access /data/logs /tmp/nginx-sem-cache /tmp/nginx-sem-store /tmp/nginx-sem/conf.d
echo 'alice:{PLAIN}secret' > /data/access/4
# `include conf.d/include/...` of the host template is relative to the config file
ln -sfn /npm-include /tmp/nginx-sem/conf.d/include
test -f /tmp/nginx-sem/conf.d/include/assets.conf

# snippets included by the advanced config of /cinc/ and /cincg/ (cases.json): what the backend can't see. proxy.conf
# sets directives of the asset cache block as Authelia's proxy.conf does, auth.conf brings an auth_request and
# nested locations as Authelia / authentik snippets do, guard.conf a rewrite-phase guard, redir.conf a
# proxy_redirect (as Authelia's proxy.conf has one), ref.conf valid_referers, rdoff.conf / rdnest.conf (included
# through a glob) / rdother.conf a proxy_redirect the backend reads from the file (no redirect line of its own)
mkdir -p /tmp/nginx-sem/snip
cat > /tmp/nginx-sem/snip/proxy.conf <<'SNIP'
proxy_set_header X-Sem-In inc;
proxy_connect_timeout 5s;
proxy_read_timeout 30s;
expires 7d;
add_header X-Sem-Inc yes always;
SNIP
cat > /tmp/nginx-sem/snip/auth.conf <<'SNIP'
location /cinc/_auth/ {
  internal;
  auth_request off;
  proxy_pass http://echo:9000/auth;
  proxy_pass_request_body off;
  proxy_set_header Content-Length "";
}
location /cinc/inner/ { return 200 "inner $uri"; }
auth_request /cinc/_auth/;
SNIP
cat > /tmp/nginx-sem/snip/hdr.conf <<'SNIP'
proxy_set_header X-Sem-In inc;
SNIP
cat > /tmp/nginx-sem/snip/redir.conf <<'SNIP'
proxy_redirect http://echo:9000/ /moved/;
SNIP
cat > /tmp/nginx-sem/snip/rdoff.conf <<'SNIP'
proxy_redirect off;
SNIP
cat > /tmp/nginx-sem/snip/rdnest.conf <<'SNIP'
include /tmp/nginx-sem/snip/rdoff.conf;
SNIP
cat > /tmp/nginx-sem/snip/rdother.conf <<'SNIP'
proxy_redirect http://other:1/ /o/;
SNIP
cat > /tmp/nginx-sem/snip/ref.conf <<'SNIP'
valid_referers none server_names;
SNIP
cat > /tmp/nginx-sem/snip/guard.conf <<'SNIP'
if ($http_x_token != secret) { return 403; }
SNIP

node /w/gen.mjs /backend > /tmp/nginx-sem/nginx.conf
nginx -t -c /tmp/nginx-sem/nginx.conf 2>&1 | tail -2
nginx -c /tmp/nginx-sem/nginx.conf &
NGINX_PID=$!
trap 'kill $NGINX_PID 2>/dev/null || true' EXIT
sleep 1

# Prints "<status> <location header> <body>" with the per server host name normalised. The echo upstream
# answers with the Host header it got: it must be the Host the client sent (with its port), also for cached
# assets (the cache key has to include the port), otherwise the response is marked HOST-MISMATCH. A port
# field starting with "^" sends the host name in upper case: nginx's $host is lower case, and so must be the
# forwarded Host.
fetch () {
	local port="$1" path="$2" creds="$3" hostport="$4" header="$5" out host sent
	if [[ "$hostport" == ^* ]]; then
		hostport="${hostport#^}"
		sent="SRV${port}${hostport}"
	else
		sent="srv${port}${hostport}"
	fi
	host="srv${port}${hostport}"
	local args=(-s -o /tmp/nginx-sem-body -D /tmp/nginx-sem-head -w '%{http_code}' -H "Host: ${sent}" --path-as-is)
	if [ -n "$creds" ]; then
		args+=(-u "$creds")
	fi
	if [ -n "$header" ]; then
		args+=(-H "$header")
	fi
	out="$(curl "${args[@]}" "http://127.0.0.1:${port}${path}")"
	local got
	got="$(grep -o '"host":"[^"]*"' /tmp/nginx-sem-body || true)"
	if [ -n "$got" ] && [ "$got" != "\"host\":\"${host}\"" ]; then
		out="$out HOST-MISMATCH(sent ${sent})"
	fi
	echo "$out $(grep -iE '^(location|x-sem-[a-z-]+):' /tmp/nginx-sem-head | tr -d '\r' | tr '\n' ' ') $(cat /tmp/nginx-sem-body)" | sed -E 's/srv80[0-9]{2}/srv/g'
}

# Cases with "Cache Assets" are served by the full host template (gen.mjs, :8012 static / :8013 dynamic), the others
# by :8002 / :8003. Neither is compared with the legacy rendering, nor is the access list case.
CACHED='^/(cache|cacheroot|qc%20p|avc|cachere|cro|cvt|api|cvar|cvarfp|nolocation|private|crw|cif|cnest|cacl|cinc|cincg|clua|csm|cstore|cstorei|cluab|cluabi|credi|cref|crdoi|curi)/'
NOT_LEGACY='^/(cache|cacheroot|acl|qc%20p|avc|cachere|cro|cvt|api|cvar|cvarfp|nolocation|private|crw|cif|cnest|cacl|cinc|cincg|clua|csm|cstore|cstorei|cluab|cluabi|credi|cref|crdoi|curi)/'

diffs=0
total=0
while IFS= read -r line; do
	[ -z "$line" ] && continue
	# path|user:password|:port|expected|header (all but the path are optional; the port is added to the Host
	# header, "^:port" also sends the host name in upper case; the expected text must be in the response, eg.
	# the URI the upstream got; header is sent as it is)
	IFS='|' read -r path creds hostport expect header <<< "$line"

	if [[ "$path" =~ $CACHED ]]; then
		static="$(fetch 8012 "$path" "$creds" "$hostport" "$header")"
		dynamic="$(fetch 8013 "$path" "$creds" "$hostport" "$header")"
	else
		static="$(fetch 8002 "$path" "$creds" "$hostport" "$header")"
		dynamic="$(fetch 8003 "$path" "$creds" "$hostport" "$header")"
	fi
	total=$((total + 1))
	# a custom location's request (asset or not) must not end up at the host's main upstream, unless expected
	if [[ "$static$dynamic" == *'"upstream":"main"'* && "$expect" != *'"upstream":"main"'* ]]; then
		echo "DIFF  main upstream $line"
		echo "   static:  $static"
		echo "   dynamic: $dynamic"
		diffs=$((diffs + 1))
		continue
	fi
	if [[ "$static$dynamic" == *HOST-MISMATCH* ]]; then
		echo "DIFF  forwarded Host $line"
		echo "   static:  $static"
		echo "   dynamic: $dynamic"
		diffs=$((diffs + 1))
		continue
	fi
	if [ -n "$expect" ] && [[ "$dynamic" != *"$expect"* || "$static" != *"$expect"* ]]; then
		echo "DIFF  expected $line"
		echo "   static:  $static"
		echo "   dynamic: $dynamic"
		diffs=$((diffs + 1))
		continue
	fi
	if [ "$static" != "$dynamic" ]; then
		echo "DIFF  static/dynamic $line"
		echo "   static:  $static"
		echo "   dynamic: $dynamic"
		diffs=$((diffs + 1))
		continue
	fi

	if [[ ! "$path" =~ $NOT_LEGACY ]]; then
		legacy="$(fetch 8001 "$path" "$creds" "$hostport" "$header")"
		total=$((total + 1))
		if [ "$legacy" != "$dynamic" ] || [[ "$legacy" == *HOST-MISMATCH* ]]; then
			echo "DIFF  legacy/dynamic $line"
			echo "   legacy:  $legacy"
			echo "   dynamic: $dynamic"
			diffs=$((diffs + 1))
			continue
		fi
	fi
	echo "SAME  $line -> $dynamic"
done < /w/reqs.txt

echo "COMPARISONS=$total DIFFS=$diffs"
[ "$diffs" -eq 0 ]
