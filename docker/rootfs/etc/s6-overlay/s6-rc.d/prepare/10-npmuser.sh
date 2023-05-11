#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info "Configuring $NPMUSER user ..."

if id -u "$NPMUSER"; then
	# user already exists
	usermod -u "$PUID" "$NPMUSER" || exit 1
else
	# Add npm user
	useradd -o -u "$PUID" -U -d "$NPMHOME" -s /bin/false "$NPMUSER" || exit 1
fi

usermod -G "$PGID" "$NPMUSER" || exit 1
groupmod -o -g "$PGID" "$NPMUSER" || exit 1
# Home for npm user
mkdir -p "$NPMHOME"
chown -R "$PUID:$PGID" "$NPMHOME"
