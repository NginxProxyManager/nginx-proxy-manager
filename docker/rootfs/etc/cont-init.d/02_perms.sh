#!/usr/bin/with-contenv bash
set -e

PUID=${PUID:-911}
PGID=${PGID:-911}

groupmod -o -g "$PGID" abc
usermod -o -u "$PUID" abc

echo '
-------------------------------------
GID/UID
-------------------------------------'
echo "
User uid:    $(id -u abc)
User gid:    $(id -g abc)
-------------------------------------
"

mkdir -p /data/logs
echo "Changing ownership of /data to abc:abc"
chown -R abc:abc /data

echo "Changing ownership of /etc/letsencrypt to abc:abc"
chown -R abc:abc /etc/letsencrypt
