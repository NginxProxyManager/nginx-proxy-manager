#!/command/with-contenv bash
# shellcheck shell=bash

# This command reads the `DISABLE_IPV6` env var and will either enable
# or disable ipv6 in all nginx configs based on this setting.

set -e

log_info 'IPv6 ...'

process_folder () {
	FILES=$(find "$1" -type f -name "*.conf")
	SED_REGEX=

	if [ "$(is_true "$DISABLE_IPV6")" = '1' ]; then
		# IPV6 is disabled
		echo "Disabling IPV6 in hosts in: $1"
		SED_REGEX='s/^([^#]*)listen \[::\]/\1#listen [::]/g'
	else
		# IPV6 is enabled
		echo "Enabling IPV6 in hosts in: $1"
		SED_REGEX='s/^(\s*)#listen \[::\]/\1listen [::]/g'
	fi

	for FILE in $FILES
	do
		echo "- ${FILE}"
		echo "$(sed -E "$SED_REGEX" "$FILE")" > $FILE
	done

	# ensure the files are still owned by the npm user
	chown -R "$PUID:$PGID" "$1"
}

process_folder /etc/nginx/conf.d
process_folder /data/nginx
