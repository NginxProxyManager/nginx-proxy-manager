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
SED_REGEX="s/\{\{NPM_ADMIN_PORT\}\}/${NPM_ADMIN_PORT}/g"

if is_mounted "$PRODFILE"; then
	echo "WARNING: skipping ${PRODFILE} — mounted file" >&2
elif [ -f "$PRODFILE.template" ]; then
	if sed -E "$SED_REGEX" "$PRODFILE.template" > "$PRODFILE" && [ -s "$PRODFILE" ]; then
		# success
		log_info "Generated ${PRODFILE} from template"
	else
		log_fatal "Failed to generate ${PRODFILE} from template"
	fi
fi
