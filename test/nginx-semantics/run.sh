#!/bin/bash
# Compares the responses of the legacy, static and dynamic rendering of custom locations.
# Runs inside the nginx-full base image, see README.md. Exits 1 when any response differs.
#
#   /w        this folder
#   /backend  the backend folder, with node_modules installed
#   a host "echo" serving echo.js on port 9000, reachable through the docker resolver 127.0.0.11

set -euo pipefail

mkdir -p /var/log/nginx /var/cache/nginx /data/access /tmp/nginx-sem-cache
echo 'alice:{PLAIN}secret' > /data/access/4

node /w/gen.mjs /backend > /tmp/nginx-sem.conf
nginx -t -c /tmp/nginx-sem.conf 2>&1 | tail -2
nginx -c /tmp/nginx-sem.conf &
NGINX_PID=$!
trap 'kill $NGINX_PID 2>/dev/null || true' EXIT
sleep 1

# Prints "<status> <location header> <body>" with the per server host name normalised. The echo upstream
# answers with the Host header it got: it must be the Host the client sent (with its port), also for cached
# assets (the cache key has to include the port), otherwise the response is marked HOST-MISMATCH.
fetch () {
	local port="$1" path="$2" creds="$3" hostport="$4" out host="srv${1}${4}"
	local args=(-s -o /tmp/nginx-sem-body -D /tmp/nginx-sem-head -w '%{http_code}' -H "Host: ${host}" --path-as-is)
	if [ -n "$creds" ]; then
		args+=(-u "$creds")
	fi
	out="$(curl "${args[@]}" "http://127.0.0.1:${port}${path}")"
	local got
	got="$(grep -o '"host":"[^"]*"' /tmp/nginx-sem-body || true)"
	if [ -n "$got" ] && [ "$got" != "\"host\":\"${host}\"" ]; then
		out="$out HOST-MISMATCH(sent ${host})"
	fi
	echo "$out $(grep -iE '^(location|x-sem-[a-z-]+):' /tmp/nginx-sem-head | tr -d '\r' | tr '\n' ' ') $(cat /tmp/nginx-sem-body)" | sed -E 's/srv800[0-9]/srv/g'
}

diffs=0
total=0
while IFS= read -r line; do
	[ -z "$line" ] && continue
	# path|user:password|:port|expected (all but the path are optional; the port is added to the Host header,
	# the expected text must be in the response, eg. the URI the upstream got)
	IFS='|' read -r path creds hostport expect <<< "$line"

	static="$(fetch 8002 "$path" "$creds" "$hostport")"
	dynamic="$(fetch 8003 "$path" "$creds" "$hostport")"
	total=$((total + 1))
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

	if [[ ! "$path" =~ ^/(cache|cacheroot|acl|qc%20p|avc)/ ]]; then
		legacy="$(fetch 8001 "$path" "$creds" "$hostport")"
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
