#!/usr/bin/with-contenv bash
# shellcheck shell=bash

set -e # Exit immediately if a command exits with a non-zero status.
set -u # Treat unset variables as an error.

log() {
  echo "[cont-init.d] $(basename "$0"): $*"
}

# Redirect admin panel logs from /dev/null to log files if enabled
if [[ ${ADMIN_PANEL_LOG} == "1" ]] || [[ ${ADMIN_PANEL_LOG} -eq 1 ]]; then
  log "Enabling admin dashboard logging"
  sed-patch 's|<ADMIN_ACCESS_LOG>|/data/logs/admin-panel_access.log standard|' /etc/nginx/conf.d/production.conf
  sed-patch 's|<ADMIN_ERROR_LOG>|/data/logs/admin-panel_error.log warn|' /etc/nginx/conf.d/production.conf
else
  log "Leaving admin dashboard logging off (default behavior)"
  sed-patch 's|<ADMIN_ACCESS_LOG>|/dev/null|' /etc/nginx/conf.d/production.conf
  sed-patch 's|<ADMIN_ERROR_LOG>|/dev/null|' /etc/nginx/conf.d/production.conf
fi

if [[ ${OPENRESTY_DEBUG} == "1" ]] || [[ ${OPENRESTY_DEBUG} -eq 1 ]]; then
  log "Changing OpenResty ERROR (fallback_error.log) logging to level: DEBUG"
  sed-patch 's|<ERROR_LOG_LEVEL>|debug|' /etc/nginx/nginx.conf

else
  log "Leaving OpenResty ERROR (fallback_error.log) logging at level: WARN (default behavior)"
  sed-patch 's|<ERROR_LOG_LEVEL>|warn|' /etc/nginx/nginx.conf
fi
