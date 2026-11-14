#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Dynamic resolvers ...'

# Dynamically generate resolvers file, if resolver is IPv6, enclose in `[]`
# thanks @tfmm
if [ "$(is_true "${DISABLE_RESOLVER:-}")" = '0' ]; then
	if [ "$(is_true "${DISABLE_IPV6:-}")" = '1' ]; then
		echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) ipv6=off valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
	else
		echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" { sub(/%.*$/,"",$2); print ($2 ~ ":")? "["$2"]": $2}' /etc/resolv.conf) valid=10s;" > /etc/nginx/conf.d/include/resolvers.conf
	fi
fi

# Migrate existing stream configs on boot when global dynamic resolution is forced via env var
if [ -d /data/nginx/stream ]; then
	STREAM_DYNAMIC=""
	if [ "$(is_true "${DISABLE_RESOLVER:-}")" = '1' ]; then
		STREAM_DYNAMIC=0
	elif [ -n "${NPM_STREAM_DYNAMIC_RESOLVE:-}" ]; then
		STREAM_DYNAMIC="$(is_true "${NPM_STREAM_DYNAMIC_RESOLVE}")"
	elif [ -n "${BYPASS_STREAM_UPSTREAM_CHECK:-}" ]; then
		STREAM_DYNAMIC="$(is_true "${BYPASS_STREAM_UPSTREAM_CHECK}")"
	fi

	if [ -n "$STREAM_DYNAMIC" ]; then
		for FILE in $(find /data/nginx/stream -type f -name "*.conf"); do
			if is_mounted "${FILE}"; then
				continue
			fi
			FILE_DYNAMIC="$STREAM_DYNAMIC"
			if [ "$(is_true "${DISABLE_RESOLVER:-}")" != '1' ]; then
				if grep -Eq '^# .*DynamicResolve: true' "$FILE"; then
					FILE_DYNAMIC=1
				elif grep -Eq '^# .*DynamicResolve: false' "$FILE"; then
					FILE_DYNAMIC=0
				fi
			fi
			TMPFILE="${FILE}.tmp"
			if [ "$FILE_DYNAMIC" = '1' ]; then
				if grep -Eq '^[[:space:]]*proxy_pass[[:space:]]+[^$][^;]+;' "$FILE"; then
					if sed -E 's|^([[:space:]]*)proxy_pass[[:space:]]+([^$;]+);|\1set $forward_host "\2";\n\1proxy_pass $forward_host;|g' "$FILE" > "$TMPFILE" && [ -s "$TMPFILE" ]; then
						mv "$TMPFILE" "$FILE"
						chown "$PUID:$PGID" "$FILE"
					else
						rm -f "$TMPFILE"
					fi
				fi
			else
				if grep -Eq '^[[:space:]]*set[[:space:]]+\$forward_host[[:space:]]+' "$FILE"; then
					if awk '
						match($0, /^[[:space:]]*set[[:space:]]+\$forward_host[[:space:]]+"([^"]+)";/) {
							s = $0
							sub(/^[[:space:]]*set[[:space:]]+\$forward_host[[:space:]]+"/, "", s)
							sub(/";.*$/, "", s)
							host = s
							next
						}
						host != "" && /^[[:space:]]*proxy_pass[[:space:]]+\$forward_host;/ {
							sub(/\$forward_host;/, host ";")
							host = ""
						}
						{ print }
					' "$FILE" > "$TMPFILE" && [ -s "$TMPFILE" ]; then
						mv "$TMPFILE" "$FILE"
						chown "$PUID:$PGID" "$FILE"
					else
						rm -f "$TMPFILE"
					fi
				fi
			fi
		done
	fi
fi
