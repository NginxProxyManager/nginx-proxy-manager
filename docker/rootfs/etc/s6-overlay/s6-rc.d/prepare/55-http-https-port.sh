#!/command/with-contenv bash
# shellcheck shell=bash

# This command reads the `HTTP_PORT` and `HTTPS_PORT` env vars and will rerender
# the nginx files to the port defined in these variables

set -e

log_info 'HTTP_PORT ...'

DEFAULT_HTTP_PORT="80"
DEFAULT_HTTPS_PORT="443"

# Make sure HTTP_PORT and HTTPS_PORT are set correctly
case "$HTTP_PORT" in
	''|*[!0-9]*)
		echo "Could not parse HTTP_PORT as integer (got \"$HTTP_PORT\")."
		echo "Using default http port \"$DEFAULT_HTTP_PORT\""
		HTTP_PORT="$DEFAULT_HTTP_PORT"
		;;
	*) true ;;
esac
if [ "$HTTP_PORT" -lt "1" ] || [ "$HTTP_PORT" -gt "65535" ]; then
	echo "HTTP_PORT must be between 1 and 65535 (got \"$HTTP_PORT\")."
	echo "Using default http port \"$DEFAULT_HTTP_PORT\""
	HTTP_PORT="$DEFAULT_HTTP_PORT"
fi
case "$HTTPS_PORT" in
	''|*[!0-9]*)
		echo "Could not parse HTTPS_PORT as integer (got \"$HTTPS_PORT\")."
		echo "Using default https port \"$DEFAULT_HTTPS_PORT\""
		HTTPS_PORT="$DEFAULT_HTTPS_PORT"
		;;
	*) true ;;
esac
if [ "$HTTPS_PORT" -lt "1" ] || [ "$HTTPS_PORT" -gt "65535" ]; then
    echo "HTTPS_PORT must be between 1 and 65535 (got \"$HTTPS_PORT\")."
	echo "Using default https port \"$DEFAULT_HTTPS_PORT\""
	HTTPS_PORT="$DEFAULT_HTTPS_PORT"
fi

process_folder () {
	FILES=$(find "$1" -type f -name "*.conf")

	HTTP_SED_REGEX='/ssl/! s/listen (\[::\]:)?[0-9]+/listen \1'$HTTP_PORT'/g'
	HTTPS_SED_REGEX='/ssl/ s/listen (\[::\]:)?[0-9]+/listen \1'$HTTPS_PORT'/g'

	echo "Setting HTTP listen port to $HTTP_PORT and HTTPS listen port to $HTTPS_PORT in: $1"

	for FILE in $FILES
	do
		echo "- ${FILE}"
		echo "$(sed -E "$HTTP_SED_REGEX" "$FILE")" > $FILE
		echo "$(sed -E "$HTTPS_SED_REGEX" "$FILE")" > $FILE
	done

	# ensure the files are still owned by the npm user
	chown -R "$PUID:$PGID" "$1"
}

process_folder /etc/nginx/conf.d
process_folder /data/nginx
