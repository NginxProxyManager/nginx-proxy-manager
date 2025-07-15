#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Setting ownership ...'

# root
chown root /tmp/nginx

locations=(
	"/data"
	"/etc/letsencrypt"
	"/run/nginx"
	"/tmp/nginx"
	"/var/cache/nginx"
	"/var/lib/logrotate"
	"/var/lib/nginx"
	"/var/log/nginx"
	"/etc/nginx/nginx"
	"/etc/nginx/nginx.conf"
	"/etc/nginx/conf.d"
)

chownit() {
	local dir="$1"
	local recursive="${2:-true}"

	local have
	have="$(stat -c '%u:%g' "$dir")"
	echo "- $dir ... "

	if [ "$have" != "$PUID:$PGID" ]; then
		if [ "$recursive" = 'true' ] && [ -d "$dir" ]; then
			chown -R "$PUID:$PGID" "$dir"
		else
			chown "$PUID:$PGID" "$dir"
		fi
		echo "    DONE"
	else
		echo "    SKIPPED"
	fi
}

for loc in "${locations[@]}"; do
	chownit "$loc"
done

if [ "$(is_true "${SKIP_CERTBOT_OWNERSHIP:-}")" = '1' ]; then
	log_info 'Skipping ownership change of certbot directories'
else
	log_info 'Changing ownership of certbot directories, this may take some time ...'
	chownit "/opt/certbot" false
	chownit "/opt/certbot/bin" false

	# Handle all site-packages directories efficiently
	find /opt/certbot/lib -type d -name "site-packages" | while read -r SITE_PACKAGES_DIR; do
		chownit "$SITE_PACKAGES_DIR"
	done
fi
