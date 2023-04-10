#!/bin/bash

set -e

CYAN='\E[1;36m'
BLUE='\E[1;34m'
YELLOW='\E[1;33m'
RED='\E[1;31m'
RESET='\E[0m'
export CYAN BLUE YELLOW RED RESET

PUID=${PUID:-0}
PGID=${PGID:-0}

if [[ "$PUID" -ne '0' ]] && [ "$PGID" = '0' ]; then
	# set group id to same as user id,
	# the user probably forgot to specify the group id and
	# it would be rediculous to intentionally use the root group
	# for a non-root user
	PGID=$PUID
fi

export PUID PGID

log_info () {
	echo -e "${BLUE}❯ ${CYAN}$1${RESET}"
}

log_error () {
	echo -e "${RED}❯ $1${RESET}"
}

log_fatal () {
	echo -e "${RED}--------------------------------------${RESET}"
	echo -e "${RED}ERROR: $1${RESET}"
	echo -e "${RED}--------------------------------------${RESET}"
	/run/s6/basedir/bin/halt
	exit 1
}

disable_ipv6 () {
	if [ "$DISABLE_IPV6" == 'true' ] || [ "$DISABLE_IPV6" == 'on' ] || [ "$DISABLE_IPV6" == '1' ] || [ "$DISABLE_IPV6" == 'yes' ]; then
		echo '1'
	else
		echo '0'
	fi
}
