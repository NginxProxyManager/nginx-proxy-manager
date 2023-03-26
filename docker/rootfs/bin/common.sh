#!/bin/bash

set -e

CYAN='\E[1;36m'
BLUE='\E[1;34m'
YELLOW='\E[1;33m'
RED='\E[1;31m'
RESET='\E[0m'
export CYAN BLUE YELLOW RED RESET

log_info () {
	echo -e "${BLUE}❯ ${CYAN}$1${RESET}"
}

log_error () {
	echo -e "${RED}❯ $1${RESET}"
}

# The `run` file will only execute 1 line so this helps keep things
# logically separated

log_fatal () {
	echo -e "${RED}--------------------------------------${RESET}"
	echo -e "${RED}ERROR: $1${RESET}"
	echo -e "${RED}--------------------------------------${RESET}"
	/run/s6/basedir/bin/halt
	exit 1
}
