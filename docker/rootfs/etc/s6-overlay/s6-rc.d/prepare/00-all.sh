#!/command/with-contenv bash
# shellcheck shell=bash

set -e

. /usr/bin/common.sh

if [ "$(id -u)" != "0" ]; then
	log_fatal "This docker container must be run as root, do not specify a user.\nYou can specify PUID and PGID env vars to run processes as that user and group after initialization."
fi

if [ "$DEBUG" = "true" ]; then
	set -x
fi

. /etc/s6-overlay/s6-rc.d/prepare/10-usergroup.sh
. /etc/s6-overlay/s6-rc.d/prepare/20-paths.sh
. /etc/s6-overlay/s6-rc.d/prepare/30-ownership.sh
. /etc/s6-overlay/s6-rc.d/prepare/40-dynamic.sh
. /etc/s6-overlay/s6-rc.d/prepare/50-ipv6.sh
. /etc/s6-overlay/s6-rc.d/prepare/60-secrets.sh
. /etc/s6-overlay/s6-rc.d/prepare/90-banner.sh
