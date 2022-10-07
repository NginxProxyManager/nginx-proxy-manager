#!/usr/bin/with-contenv bash
# shellcheck shell=bash

log() {
  echo -e "${BLUE}[cont-init.d] ${RED}$(basename "$0")${CYAN}>>>${RESET} $*"
}

if [[ -f /etc/nginx/conf.d/production.conf ]]; then
admin_log=$(grep "<ADMIN_ACCESS_LOG>" /etc/nginx/conf.d/production.conf)
  if [[ ${ADMIN_PANEL_LOG} == "1" ]] || [[ ${ADMIN_PANEL_LOG} -eq 1 ]]; then
    if [[ -n "${admin_log}" ]]; then
      log "Enabling admin dashboard logging"
      sed -i 's|<ADMIN_ACCESS_LOG>|/data/logs/admin-panel_access.log standard|' /etc/nginx/conf.d/production.conf
      sed -i 's|<ADMIN_ERROR_LOG>|/data/logs/admin-panel_error.log warn|' /etc/nginx/conf.d/production.conf
    fi
  else
    if [[ -n "${admin_log}" ]]; then
      log "Leaving admin dashboard logging off (default behavior)"
      sed -i 's|<ADMIN_ACCESS_LOG>|/dev/null|' /etc/nginx/conf.d/production.conf
      sed -i 's|<ADMIN_ERROR_LOG>|/dev/null|' /etc/nginx/conf.d/production.conf
    fi
  fi
fi


default_log=$(grep "<ERROR_LOG_LEVEL>" /etc/nginx/nginx.conf)
if [[ ${OPENRESTY_DEBUG} == "1" ]] || [[ ${OPENRESTY_DEBUG} -eq 1 ]]; then
  if [[ -n "${default_log}" ]]; then
    log "Changing OpenResty ERROR (fallback_error.log) logging to level: DEBUG"
    sed -i 's|<ERROR_LOG_LEVEL>|debug|' /etc/nginx/nginx.conf
  fi
else
  if [[ -n "${default_log}" ]]; then
    log "Leaving OpenResty ERROR (fallback_error.log) logging at level: WARN (default behavior)"
    sed -i 's|<ERROR_LOG_LEVEL>|warn|' /etc/nginx/nginx.conf
  fi
fi

