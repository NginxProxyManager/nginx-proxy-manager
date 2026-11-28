#!/command/with-contenv bash
# shellcheck shell=bash

# This command reads the `NPM_ADMIN_PORT` env var and will fall
# back to 81 if this is not set or is not a number.

set -e

log_info 'Admin Port ...'

NPM_ADMIN_PORT="${NPM_ADMIN_PORT:-81}"
# ensure admin port is a number
if ! [[ "$NPM_ADMIN_PORT" =~ ^[0-9]+$ ]]; then
	echo "WARNING: NPM_ADMIN_PORT must be a number. Defaulting to 81" >&2
	NPM_ADMIN_PORT=81
fi

PRODFILE="/etc/nginx/conf.d/production.conf"

# A new secret on every start. The admin nginx sends it with X-NPM-Peer-Addr, and the backend
# only trusts that header when the secret matches, so a proxy host or stream forwarding to the
# backend port can't pass a forged one through.
NPM_PEER_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
if [ "${#NPM_PEER_SECRET}" -ne 64 ]; then
	log_fatal "Failed to generate the backend peer secret"
fi

SED_REGEX="s/\{\{NPM_ADMIN_PORT\}\}/${NPM_ADMIN_PORT}/g;s/\{\{NPM_PEER_SECRET\}\}/${NPM_PEER_SECRET}/g"

if is_mounted "$PRODFILE"; then
	echo "WARNING: skipping ${PRODFILE} — mounted file" >&2
elif [ -f "$PRODFILE.template" ]; then
	if sed -E "$SED_REGEX" "$PRODFILE.template" > "$PRODFILE" && [ -s "$PRODFILE" ]; then
		# success
		log_info "Generated ${PRODFILE} from template"
		# Hand the secret to the backend; with-contenv loads this directory into its environment
		printf '%s' "$NPM_PEER_SECRET" > /var/run/s6/container_environment/NPM_PEER_SECRET
	else
		log_fatal "Failed to generate ${PRODFILE} from template"
	fi
fi
