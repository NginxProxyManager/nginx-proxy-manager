#!/usr/bin/with-contenv bash
# shellcheck shell=bash

set -e # Exit immediately if a command exits with a non-zero status.
set -u # Treat unset variables as an error.

log() {
  echo "[cont-init.d] $(basename "$0"): $*"
}

mkdir -p /data/modsec/ruleset
ln -s /data/modsec/ /etc/nginx

[ ! -f /data/modsec/main.conf ] && MODSEC_CREATE="1"

if [ "${MODSEC_CREATE}" == "1" ] || [ "${MODSEC_CREATE}" -eq 1 ]; then
  log "Setting up modsecurity persistent data"
  cp /usr/local/modsecurity/templates/main.conf /data/modsec/main.conf
  cp /usr/local/modsecurity/templates/modsecurity.conf /data/modsec/modsecurity.conf
  cp /usr/local/modsecurity/templates/unicode.mapping /data/modsec/unicode.mapping
  cp -r /usr/local/modsecurity/templates/* /data/modsec/
  cp -r /usr/local/modsecurity/templates/ruleset/* /data/modsec/ruleset/
  mv /data/modsec/ruleset/crs-setup.conf.example /data/modsec/ruleset/crs-setup.conf
fi

# Enable modsecurity in the server block of :80 and :443
# Can disable this (default) and add the modsec directives in each location block
if [ "${MODSEC_ENABLE}" == "1" ] || [ "${MODSEC_ENABLE}" -eq 1 ]; then
  log "Enabling modsecurity in server block of port 80 and 443"
  sed-patch "s|#<MODSEC_ON>|modsecurity on;|g" /etc/nginx/conf.d/default.conf
  sed-patch "s|#<MODSEC_RULES>|modsecurity_rules_file /etc/nginx/modsec/main.conf;|g" /etc/nginx/conf.d/default.conf
fi
# Enabled modsecurity in the server block of :81 (admin dashboard)
if [ "${MODSEC_ADMIN_PANEL}" == "1" ] || [ "${MODSEC_ADMIN_PANEL}" -eq 1 ]; then
  log "Enabling modsecurity in server block of admin dashboard port 81"
  sed-patch "s|#<MODSEC_ON>|modsecurity on;|g" /etc/nginx/conf.d/production.conf
  sed-patch "s|#<MODSEC_RULES>|modsecurity_rules_file /etc/nginx/modsec/main.conf;|g" /etc/nginx/conf.d/production.conf

fi