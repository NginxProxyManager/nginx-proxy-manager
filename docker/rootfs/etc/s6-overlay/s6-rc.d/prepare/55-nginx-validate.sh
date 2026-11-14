#!/command/with-contenv bash
# shellcheck shell=bash

# Makes sure nginx can start: when `nginx -t` fails because of the config file of a
# proxy/redirection/404 host or stream, that file is moved to <file>.err (which nginx
# does not include) and the test is repeated. Without this one broken host, for example
# a custom location pointing at a container that is not running, keeps nginx and with it
# every site and the admin UI from starting.
#
# The backend regenerates these hosts once it is up and marks the ones that are still
# broken as offline in the UI.
#
# The test runs as the user nginx and the backend run as (PUID:PGID). `nginx -t` creates
# files (log files on a fresh volume, the pid file, ...) and as root they would end up
# owned by root, which nginx running as PUID can't open.
#
# This script never fails the container start.

log_info 'Validating nginx config ...'

# Earlier versions ran this test as root and left root owned files behind: log files of
# every host (/data/logs/proxy-host-1_access.log, ...), the pid file, temp and cache
# directories and /etc/nginx/nginx/off (from `error_log off`). 30-ownership.sh doesn't
# look inside a directory that is already owned by PUID:PGID, and nginx running as
# PUID fails to open them ("Permission denied", no file or line to blame). Give back
# whatever isn't owned by the runtime user. Only the files that are wrong are touched.
if [ "$PUID" != '0' ]; then
	for NGINX_VALIDATE_PATH in /data/logs /var/log/nginx /run/nginx /tmp/nginx /var/lib/nginx /var/cache/nginx /etc/nginx/nginx/off; do
		if [ -e "$NGINX_VALIDATE_PATH" ]; then
			find "$NGINX_VALIDATE_PATH" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown -h "$PUID:$PGID" {} + 2>/dev/null || true
		fi
	done
fi

# The backend moves host configs to <file>.npm-aside for a moment while it tests without
# them. A backend that was killed right then leaves them there: put them back (or drop
# them when the .conf was written again since).
for NGINX_VALIDATE_ASIDE in /data/nginx/proxy_host/*.conf.npm-aside /data/nginx/redirection_host/*.conf.npm-aside /data/nginx/dead_host/*.conf.npm-aside /data/nginx/stream/*.conf.npm-aside /data/nginx/default_host/*.conf.npm-aside; do
	[ -e "$NGINX_VALIDATE_ASIDE" ] || continue
	NGINX_VALIDATE_CONF="${NGINX_VALIDATE_ASIDE%.npm-aside}"
	if [ -e "$NGINX_VALIDATE_CONF" ]; then
		rm -f "$NGINX_VALIDATE_ASIDE" || log_error "Could not remove stale ${NGINX_VALIDATE_ASIDE}"
	elif mv -f "$NGINX_VALIDATE_ASIDE" "$NGINX_VALIDATE_CONF"; then
		log_info "Restored ${NGINX_VALIDATE_CONF} from an interrupted config test"
	else
		log_error "Could not restore ${NGINX_VALIDATE_CONF} from ${NGINX_VALIDATE_ASIDE}"
	fi
done

# Every round moves at least one host config aside (or stops), so there can't be more rounds than
# host configs; one more for the final test
NGINX_VALIDATE_MAX="$(find /data/nginx/proxy_host /data/nginx/redirection_host /data/nginx/dead_host /data/nginx/stream -maxdepth 1 -name '*.conf' 2>/dev/null | wc -l)"
NGINX_VALIDATE_MAX=$((NGINX_VALIDATE_MAX + 1))
NGINX_VALIDATE_COUNT=0
NGINX_VALIDATE_HOSTS='/data/nginx/(proxy_host|redirection_host|dead_host|stream)/[0-9]+\.conf'

# awk program: succeeds when the file mentions the path in ENVIRON["NGINX_VALIDATE_P"] outside
# of comments. Read like nginx does (see lib/nginx-tokenize.js in the backend): `#` starts a
# comment only at the start of a token, so it is part of `/data/certs/#old.pem` and of a quoted
# path like "/data/logs/#x/access.log".
NGINX_VALIDATE_MENTIONS='
BEGIN { p = ENVIRON["NGINX_VALIDATE_P"] }
{
	out = ""; q = ""; start = 1
	for (i = 1; i <= length($0); i++) {
		c = substr($0, i, 1)
		if (q != "") {
			out = out c
			if (c == "\\") { i++; out = out substr($0, i, 1) } else if (c == q) { q = "" }
			start = 0
			continue
		}
		if (c == "#" && start) break
		if ((c == "\"" || c == "\047") && start) q = c
		out = out c
		start = (c == " " || c == "\t" || c == ";" || c == "{" || c == "}")
	}
	if (index(out, p)) found = 1
}
END { exit !found }'

# Runs nginx -t as PUID:PGID, prints the output
nginx_validate_test() {
	s6-setuidgid "$PUID:$PGID" nginx -t -g 'error_log /dev/null;' 2>&1 || true
}

# Drops the docker startup alert about /var/log/nginx/error.log (always a false positive). Real
# errors that mention that path (a host's own error_log) are kept, they name the broken host.
nginx_validate_clean() {
	grep -vE '\[alert\].*could not open error log file: open\(\) "/var/log/nginx/error\.log"' || true
}

# Prints the first error line (emerg/alert/crit) of nginx -t output given as $1
nginx_validate_error() {
	echo "$1" | nginx_validate_clean | grep -E '\[(emerg|alert|crit)\]' | head -n 1 || true
}

# Succeeds when the nginx -t output given as $1 no longer fails because of the path $2:
# the test passes, or the remaining error doesn't name the path
nginx_validate_fixes() {
	echo "$1" | grep -q 'test is successful' \
		|| ! nginx_validate_error "$1" | grep -qF -- "$2"
}

# Moves the files given as arguments aside, runs nginx -t, puts them back and prints the
# output. A file that can't be put back is logged (the backend regenerates it later).
nginx_validate_test_aside() {
	local file moved=()
	for file in "$@"; do
		if mv -f "$file" "${file}.npm-aside"; then
			moved+=("$file")
		fi
	done
	nginx_validate_test
	for file in "${moved[@]}"; do
		if ! mv -f "${file}.npm-aside" "$file"; then
			log_error "Could not move ${file}.npm-aside back to ${file}" >&2
		fi
	done
}

while [ "$NGINX_VALIDATE_COUNT" -lt "$NGINX_VALIDATE_MAX" ]; do
	NGINX_VALIDATE_OUTPUT="$(nginx_validate_test)"

	if echo "$NGINX_VALIDATE_OUTPUT" | grep -q 'test is successful'; then
		break
	fi

	# Only the error itself names the broken file: warnings before it (eg. a deprecated
	# "listen ... http2" in a healthy host) name files too
	NGINX_VALIDATE_ERROR="$(nginx_validate_error "$NGINX_VALIDATE_OUTPUT")"
	# The files to move aside, one per line
	NGINX_VALIDATE_FILES="$(echo "$NGINX_VALIDATE_ERROR" | grep -oE "in ${NGINX_VALIDATE_HOSTS}:[0-9]+" | head -n 1 | sed -E 's/^in //; s/:[0-9]+$//' || true)"

	# Some errors, eg. a missing certificate file or a log file nginx can't open, don't name
	# the config file. The candidates are the host configs that mention a path named in the
	# error (any directive, comments don't count). A mention alone is not enough: each
	# candidate is moved aside in turn and only the one whose removal makes the error go away
	# (the test passes, or the remaining error no longer names the path) is blamed. The others
	# are put back. When no single candidate helps (eg. a certificate several hosts share),
	# all of them are moved aside together, and if that helps, the group is reduced to the
	# members whose removal is needed and those are blamed.
	if [ -z "$NGINX_VALIDATE_FILES" ] && ! echo "$NGINX_VALIDATE_ERROR" | grep -qE ' in /[^ ]+:[0-9]+$'; then
		while IFS= read -r NGINX_VALIDATE_PATH; do
			[ -n "$NGINX_VALIDATE_PATH" ] || continue
			NGINX_VALIDATE_CANDIDATES=()
			while IFS= read -r NGINX_VALIDATE_CANDIDATE; do
				[ -n "$NGINX_VALIDATE_CANDIDATE" ] || continue
				if NGINX_VALIDATE_P="$NGINX_VALIDATE_PATH" awk "$NGINX_VALIDATE_MENTIONS" "$NGINX_VALIDATE_CANDIDATE"; then
					NGINX_VALIDATE_CANDIDATES+=("$NGINX_VALIDATE_CANDIDATE")
				fi
			done <<<"$(grep -lF -- "$NGINX_VALIDATE_PATH" /data/nginx/proxy_host/*.conf /data/nginx/redirection_host/*.conf /data/nginx/dead_host/*.conf /data/nginx/stream/*.conf 2>/dev/null || true)"

			for NGINX_VALIDATE_CANDIDATE in "${NGINX_VALIDATE_CANDIDATES[@]}"; do
				NGINX_VALIDATE_RETRY="$(nginx_validate_test_aside "$NGINX_VALIDATE_CANDIDATE")"
				if nginx_validate_fixes "$NGINX_VALIDATE_RETRY" "$NGINX_VALIDATE_PATH"; then
					NGINX_VALIDATE_FILES="$NGINX_VALIDATE_CANDIDATE"
					break 2
				fi
			done

			if [ "${#NGINX_VALIDATE_CANDIDATES[@]}" -gt 1 ]; then
				NGINX_VALIDATE_RETRY="$(nginx_validate_test_aside "${NGINX_VALIDATE_CANDIDATES[@]}")"
				if nginx_validate_fixes "$NGINX_VALIDATE_RETRY" "$NGINX_VALIDATE_PATH"; then
					# A mention alone doesn't make a host part of the cause (eg. a healthy host that only
					# names the certificate path in an add_header): put each member back in turn and keep
					# it out of the group when the error stays away without it. Groups of two can't
					# shrink, every single candidate failed above.
					NGINX_VALIDATE_GROUP=("${NGINX_VALIDATE_CANDIDATES[@]}")
					for NGINX_VALIDATE_CANDIDATE in "${NGINX_VALIDATE_CANDIDATES[@]}"; do
						[ "${#NGINX_VALIDATE_GROUP[@]}" -ge 3 ] || break
						NGINX_VALIDATE_REST=()
						for NGINX_VALIDATE_FILE in "${NGINX_VALIDATE_GROUP[@]}"; do
							[ "$NGINX_VALIDATE_FILE" = "$NGINX_VALIDATE_CANDIDATE" ] || NGINX_VALIDATE_REST+=("$NGINX_VALIDATE_FILE")
						done
						NGINX_VALIDATE_RETRY="$(nginx_validate_test_aside "${NGINX_VALIDATE_REST[@]}")"
						if nginx_validate_fixes "$NGINX_VALIDATE_RETRY" "$NGINX_VALIDATE_PATH"; then
							NGINX_VALIDATE_GROUP=("${NGINX_VALIDATE_REST[@]}")
						fi
					done
					NGINX_VALIDATE_FILES="$(printf '%s\n' "${NGINX_VALIDATE_GROUP[@]}")"
					break
				fi
			fi
		# nginx quotes the path as it is, spaces included (a path written quoted in the config can have them)
		done <<<"$(echo "$NGINX_VALIDATE_ERROR" | grep -oE '"/[^"]+"' | sed -E 's/^"//; s/"$//' || true)"
	fi

	if [ -z "$NGINX_VALIDATE_FILES" ]; then
		log_error 'nginx config test failed and no host config could be blamed:'
		echo "$NGINX_VALIDATE_OUTPUT" | nginx_validate_clean >&2
		break
	fi

	NGINX_VALIDATE_MOVED=0
	while IFS= read -r NGINX_VALIDATE_FILE; do
		if [ -z "$NGINX_VALIDATE_FILE" ] || [ ! -f "$NGINX_VALIDATE_FILE" ]; then
			continue
		fi
		log_error "Disabling ${NGINX_VALIDATE_FILE}, nginx rejected it (save the host again, or leave NPM_RECONCILE_ON_START on, to bring it back):"
		echo "$NGINX_VALIDATE_ERROR" >&2
		if mv -f "$NGINX_VALIDATE_FILE" "${NGINX_VALIDATE_FILE}.err"; then
			NGINX_VALIDATE_MOVED=$((NGINX_VALIDATE_MOVED + 1))
		else
			log_error "Could not move ${NGINX_VALIDATE_FILE}"
		fi
	done <<<"$NGINX_VALIDATE_FILES"

	if [ "$NGINX_VALIDATE_MOVED" -eq 0 ]; then
		log_error 'nginx config test failed and the blamed host config could not be moved:'
		echo "$NGINX_VALIDATE_OUTPUT" | nginx_validate_clean >&2
		break
	fi

	NGINX_VALIDATE_COUNT=$((NGINX_VALIDATE_COUNT + 1))
done

unset -f nginx_validate_test nginx_validate_clean nginx_validate_error nginx_validate_fixes nginx_validate_test_aside
unset NGINX_VALIDATE_MENTIONS NGINX_VALIDATE_P NGINX_VALIDATE_MAX NGINX_VALIDATE_COUNT NGINX_VALIDATE_HOSTS NGINX_VALIDATE_OUTPUT NGINX_VALIDATE_ERROR NGINX_VALIDATE_FILES NGINX_VALIDATE_FILE NGINX_VALIDATE_PATH NGINX_VALIDATE_CANDIDATE NGINX_VALIDATE_CANDIDATES NGINX_VALIDATE_GROUP NGINX_VALIDATE_REST NGINX_VALIDATE_RETRY NGINX_VALIDATE_ASIDE NGINX_VALIDATE_CONF NGINX_VALIDATE_MOVED
