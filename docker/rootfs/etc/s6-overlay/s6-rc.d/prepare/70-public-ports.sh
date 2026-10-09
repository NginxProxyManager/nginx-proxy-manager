#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info "Configuring public ports ..."
/command/with-contenv node /app/scripts/configure-public-ports.mjs
