#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info "Configuring $NPMUSER user ..."

if id -u "$NPMUSER" 2>/dev/null; then
	# user already exists
	usermod -u "$PUID" "$NPMUSER"
else
	# Add user
	useradd -o -u "$PUID" -U -d "$NPMHOME" -s /bin/false "$NPMUSER"
fi

log_info "Configuring $NPMGROUP group ..."
if [ "$(get_group_id "$NPMGROUP")" = '' ]; then
	# Add group. This will not set the id properly if it's already taken
	groupadd -f -g "$PGID" "$NPMGROUP"
else
	groupmod -o -g "$PGID" "$NPMGROUP"
fi

# Set the group ID and check it
groupmod -o -g "$PGID" "$NPMGROUP"
if [ "$(get_group_id "$NPMGROUP")" != "$PGID" ]; then
	echo "ERROR: Unable to set group id properly"
	exit 1
fi

# Set the group against the user and check it
usermod -G "$PGID" "$NPMGROUP"
if [ "$(id -g "$NPMUSER")" != "$PGID" ] ; then
	echo "ERROR: Unable to set group against the user properly"
	exit 1
fi

# Home for user
mkdir -p "$NPMHOME"
chown -R "$PUID:$PGID" "$NPMHOME"
