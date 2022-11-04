#!/usr/bin/with-contenv bash
# shellcheck shell=bash

set -e # Exit immediately if a command exits with a non-zero status.
set -u # Treat unset variables as an error.

log() {
  echo -e "${BLUE}[cont-init.d] ${RED}$(basename "$0")${CYAN}>>>${RESET} $*"
}

mkdir -p /data/modsec/ruleset
if [ ! -L /etc/nginx/modsec ]; then
  log "Symbolically Linking /data/modsec into /etc/nginx"
  ln -s /data/modsec/ /etc/nginx
fi

[ ! -f /data/modsec/main.conf ] && MODSEC_CREATE="1"

if [ "${MODSEC_CREATE}" == "1" ] || [ "${MODSEC_CREATE}" -eq 1 ]; then
  log "Setting up modsecurity persistent data"
  cp /usr/local/modsecurity/templates/main.conf /data/modsec/main.conf
  cp /usr/local/modsecurity/templates/modsecurity.conf /data/modsec/modsecurity.conf
  cp /usr/local/modsecurity/templates/unicode.mapping /data/modsec/unicode.mapping
  cp -r /usr/local/modsecurity/templates/* /data/modsec/
  cp -r /usr/local/modsecurity/templates/ruleset/* /data/modsec/ruleset/
  if [ -f /data/modsec/ruleset/crs-setup.conf.example ]; then
    mv /data/modsec/ruleset/crs-setup.conf.example /data/modsec/ruleset/crs-setup.conf
  elif [ -f /data/modsec/ruleset/crs-setup.conf ]; then
    mv /data/modsec/ruleset/crs-setup.conf /data/modsec/ruleset/crs-setup.conf
  fi
fi

# Enable modsecurity in the server block of :80 and :443
# Can disable this (default) and add the modsec directives in each location block
if [ "${MODSEC_ENABLE}" == "1" ] || [ "${MODSEC_ENABLE}" -eq 1 ]; then
  message="Enabling modsecurity in ROOT http block"
  sed -i "s|#<MODSEC_ON>|modsecurity on;|g" /etc/nginx/nginx.conf
  sed -i "s|#<MODSEC_RULES>|modsecurity_rules_file /etc/nginx/modsec/main.conf;|g" /etc/nginx/nginx.conf
  # Enabled modsecurity in the server block of :81 (admin dashboard)
  if [ "${MODSEC_ADMIN_PANEL}" == "0" ] || [ "${MODSEC_ADMIN_PANEL}" -eq 0 ]; then
    log "${message} and DISABLING in Admin dashboard port 81"
    sed -i "s|#<MODSEC_ON>|modsecurity off;|g" /etc/nginx/conf.d/production.conf
  else
    log "${message} and Admin dashboard port 81"
  fi
fi
