#!/usr/bin/with-contenv bash
# shellcheck shell=bash
set -e
log() {
  echo -e "${BLUE}[cont-init.d] ${RED}$(basename "$0")${CYAN}>>>${RESET} $*"
}
mkdir -p /data/logs
log "Changing ownership of /data/logs to $(id -u):$(id -g)"
chown -R "$(id -u):$(id -g)" /data/logs
