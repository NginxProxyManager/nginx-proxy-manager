#!/command/with-contenv bash
# shellcheck shell=bash

# This command reads the `NPM_DISABLE_IPV4` and `NPM_DISABLE_IPV6`` env vars and will either enable
# or disable ipv6 in all nginx configs based on this setting.

set -e

log_info 'IPv4/IPv6 ...'

DIS_4=$(is_true "$NPM_DISABLE_IPV4")
DIS_6=$(is_true "$NPM_DISABLE_IPV6")

# Ensure someone didn't misconfigure the settings
if [ "$DIS_4" = "1" ] && [ "$DIS_6" = "1" ]; then
	log_fatal 'NPM_DISABLE_IPV4 and NPM_DISABLE_IPV6 cannot both be set!'
fi

process_folder () {
	FILES=$(find "$1" -type f -name "*.conf")
	SED_REGEX=

	# IPV4 ...
	if [ "$DIS_4" = "1" ]; then
		echo "Disabling IPV4 in hosts in: $1"
		SED_REGEX='s/^([^#]*)listen ([0-9]+)/\1#listen \2/g'
	else
		echo "Enabling IPV4 in hosts in: $1"
		SED_REGEX='s/^(\s*)#listen ([0-9]+)/\1listen \2/g'
	fi

	for FILE in $FILES
	do
		echo "  - ${FILE}"
		sed -E -i "$SED_REGEX" "$FILE" || true
	done

	# IPV6 ...
	if [ "$DIS_6" = "1" ]; then
		echo "Disabling IPV6 in hosts in: $1"
		SED_REGEX='s/^([^#]*)listen \[::\]/\1#listen [::]/g'
	else
		echo "Enabling IPV6 in hosts in: $1"
		SED_REGEX='s/^(\s*)#listen \[::\]/\1listen [::]/g'
	fi

	for FILE in $FILES
	do
		echo "  - ${FILE}"
		sed -E -i "$SED_REGEX" "$FILE" || true
	done

	# ensure the files are still owned by the npm user
	chown -R "$PUID:$PGID" "$1"
}

process_folder /etc/nginx/conf.d
process_folder /data/nginx
