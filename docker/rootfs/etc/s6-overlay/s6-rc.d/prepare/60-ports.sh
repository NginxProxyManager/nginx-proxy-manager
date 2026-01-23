#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Ports ...'

# Default ports
HTTP_PORT=${HTTP_PORT:-80}
HTTPS_PORT=${HTTPS_PORT:-443}
WEB_UI_PORT=${WEB_UI_PORT:-81}

process_folder () {
	echo "Processing folder: $1"
	FILES=$(find "$1" -type f -name "*.conf")

	for FILE in $FILES
	do
		echo "- ${FILE}"
		# Replace HTTP port
		sed -i -E "s/listen 80([^0-9]|$)/listen ${HTTP_PORT}\1/g" "$FILE"
		sed -i -E "s/listen \[::\]:80([^0-9]|$)/listen [::]:${HTTP_PORT}\1/g" "$FILE"
		sed -i -E "s/set \$port \"80\"/set \$port \"${HTTP_PORT}\"/g" "$FILE"

		# Replace HTTPS port
		sed -i -E "s/listen 443([^0-9]|$)/listen ${HTTPS_PORT}\1/g" "$FILE"
		sed -i -E "s/listen \[::\]:443([^0-9]|$)/listen [::]:${HTTPS_PORT}\1/g" "$FILE"
		sed -i -E "s/set \$port \"443\"/set \$port \"${HTTPS_PORT}\"/g" "$FILE"

		# Replace Web UI port
		sed -i -E "s/listen 81([^0-9]|$)/listen ${WEB_UI_PORT}\1/g" "$FILE"
		sed -i -E "s/listen \[::\]:81([^0-9]|$)/listen [::]:${WEB_UI_PORT}\1/g" "$FILE"
	done

	# ensure the files are still owned by the npm user
	chown -R "$PUID:$PGID" "$1"
}

process_folder /etc/nginx/conf.d
process_folder /data/nginx
