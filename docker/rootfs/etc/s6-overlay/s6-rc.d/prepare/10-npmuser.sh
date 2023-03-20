#!/command/with-contenv bash
# shellcheck shell=bash

set -e

PUID=${PUID:-911}
PGID=${PGID:-911}

# Add npmuser user
log_info 'Creating npmuser ...'

groupmod -g 1000 users || exit 1
useradd -u "${PUID}" -U -d /data -s /bin/false npmuser || exit 1
usermod -G users npmuser || exit 1
groupmod -o -g "$PGID" npmuser || exit 1
# Home for npmuser
mkdir -p /tmp/npmuserhome
chown -R npmuser:npmuser /tmp/npmuserhome
