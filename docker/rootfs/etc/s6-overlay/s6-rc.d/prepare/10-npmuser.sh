#!/command/with-contenv bash
# shellcheck shell=bash

set -e

PUID=${PUID:-911}
PGID=${PGID:-911}

log_info 'Configuring npmuser ...'

groupmod -g 1000 users || exit 1

if id -u npmuser; then
	# user already exists
	usermod -u "${PUID}" npmuser || exit 1
else
	# Add npmuser user
	useradd -u "${PUID}" -U -d /tmp/npmuserhome -s /bin/false npmuser || exit 1
fi

usermod -G users npmuser || exit 1
groupmod -o -g "${PGID}" npmuser || exit 1
# Home for npmuser
mkdir -p /tmp/npmuserhome
chown -R npmuser:npmuser /tmp/npmuserhome
