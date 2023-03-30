#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Configuring npmuser ...'

if id -u npmuser; then
	# user already exists
	usermod -u "$PUID" npmuser || exit 1
else
	# Add npmuser user
	useradd -o -u "$PUID" -U -d /tmp/npmuserhome -s /bin/false npmuser || exit 1
fi

usermod -G "$PGID" npmuser || exit 1
groupmod -o -g "$PGID" npmuser || exit 1
# Home for npmuser
mkdir -p /tmp/npmuserhome
chown -R "$PUID:$PGID" /tmp/npmuserhome
