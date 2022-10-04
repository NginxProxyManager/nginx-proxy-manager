#!/usr/bin/with-contenv bash
# shellcheck shell=bash

set -e # Exit immediately if a command exits with a non-zero status.
set -u # Treat unset variables as an error.

log() {
  echo "[cont-init.d] $(basename "$0"): $*"
}

if [ "${CROWDSEC_BOUNCER}" == "1" ] || [ "${CROWDSEC_BOUNCER}" -eq 1 ]; then
  log "Enabling CrowdSec OpenResty Bouncer"
  mkdir -p /data/crowdsec
  if [ -f /data/crowdsec/crowdsec-openresty-bouncer.conf ]; then
    #Install Crowdsec Bouncer Config.
    cp /crowdsec/crowdsec-openresty-bouncer.conf.template /data/crowdsec/crowdsec-openresty-bouncer.conf
    log "Crowdsec OpenResty Bouncer Config copied to /data/crowdsec/crowdsec-openresty-bouncer.conf"
  fi
  # Create lualib plugin directory for crowdsec and move crowdsec lua libs into it
  mkdir -p /etc/nginx/lualib/plugins/crowdsec/
  cp /crowdsec/lua/* /etc/nginx/lualib/plugins/crowdsec/
  # This initilizes crowdsec as /etc/nginx/conf.d/* is included in nginx.conf
  cp /crowdsec/crowdsec_openresty.conf /etc/nginx/conf.d/
fi