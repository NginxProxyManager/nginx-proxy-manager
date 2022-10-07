#!/usr/bin/with-contenv bash
# shellcheck shell=bash

log() {
    echo -e "${BLUE}[cont-init.d] ${RED}$(basename "$0")${CYAN}>>>${RESET} $*"
}


if [ -n "${TZ}" ]; then
  log "Setting timezone to ${TZ}"
    echo "${TZ}" > /etc/timezone
    ln -sf "/usr/share/zoneinfo/${TZ}" /etc/localtime
fi
