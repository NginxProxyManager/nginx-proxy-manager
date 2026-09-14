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

		# HTTP port: plain listen with no ssl/default keyword following
		sed -i -E "s/listen [0-9]+(;)/listen ${HTTP_PORT}\1/g" "$FILE"
		sed -i -E "s/listen \[::\]:[0-9]+(;)/listen [::]:${HTTP_PORT}\1/g" "$FILE"
		sed -i -E "s/set \$port \"80\"/set \$port \"${HTTP_PORT}\"/g" "$FILE"

		# HTTPS port: listen identified by ssl keyword
		sed -i -E "s/listen [0-9]+( ssl)/listen ${HTTPS_PORT}\1/g" "$FILE"
		sed -i -E "s/listen \[::\]:[0-9]+( ssl)/listen [::]:${HTTPS_PORT}\1/g" "$FILE"
		sed -i -E "s/set \$port \"443\"/set \$port \"${HTTPS_PORT}\"/g" "$FILE"

		# Web UI port: listen identified by default keyword
		sed -i -E "s/listen [0-9]+( default)/listen ${WEB_UI_PORT}\1/g" "$FILE"
		sed -i -E "s/listen \[::\]:[0-9]+( default)/listen [::]:${WEB_UI_PORT}\1/g" "$FILE"
	done

	# ensure the files are still owned by the npm user
	chown -R "$PUID:$PGID" "$1"
}

process_folder /etc/nginx/conf.d
process_folder /data/nginx
