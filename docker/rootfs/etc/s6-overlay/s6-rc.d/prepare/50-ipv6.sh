#!/command/with-contenv bash
# shellcheck shell=bash

# This command reads the `DISABLE_IPV6` env var and will either enable
# or disable ipv6 in all nginx configs based on this setting.

set -e

log_info 'IPv6 ...'

# Lowercase
DISABLE_IPV6=$(echo "${DISABLE_IPV6:-}" | tr '[:upper:]' '[:lower:]')
SKIP_FILE_OWNERSHIP=$(echo "${SKIP_FILE_OWNERSHIP:-}" | tr '[:upper:]' '[:lower:]')

process_folder () {
	FILES=$(find "$1" -type f -name "*.conf")
	SED_REGEX=

	if [ "$DISABLE_IPV6" == "true" ] || [ "$DISABLE_IPV6" == "on" ] || [ "$DISABLE_IPV6" == "1" ] || [ "$DISABLE_IPV6" == "yes" ]; then
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
 	fi
}

# process files on base image
process_folder /etc/nginx/conf.d
# conditionally process files that are probably in a volume or bind
if [ "$SKIP_FILE_OWNERSHIP" == "true" ] || [ "$SKIP_FILE_OWNERSHIP" == "on" ] || [ "$SKIP_FILE_OWNERSHIP" == "1" ] || [ "$SKIP_FILE_OWNERSHIP" == "yes" ]; then
    log_info 'Skipping data and letsencrypt ownership, use only with caution ...'
else
    process_folder /data/nginx
fi
