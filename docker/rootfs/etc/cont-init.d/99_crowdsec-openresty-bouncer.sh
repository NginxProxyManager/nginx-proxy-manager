#!/usr/bin/with-contenv bash
# shellcheck shell=bash

set -e # Exit immediately if a command exits with a non-zero status.
set -u # Treat unset variables as an error.

log() {
  echo "[cont-init.d] $(basename "$0"): $*"
}

if [ "${CROWDSEC_BOUNCER}" == "1" ] || [ "${CROWDSEC_BOUNCER}" -eq 1 ]; then
  mkdir -p /data/crowdsec
  #Install Crowdsec Bouncer Config.
  [ -f /data/crowdsec/crowdsec-openresty-bouncer.conf ] || cp /crowdsec/crowdsec-openresty-bouncer.conf /data/crowdsec/crowdsec-openresty-bouncer.conf
  mkdir -p /etc/nginx/lualib/plugins/crowdsec/
  cp /crowdsec/lua/* /etc/nginx/lualib/plugins/crowdsec/
  cp /crowdsec/crowdsec_openresty.conf /etc/nginx/conf.d/
  sed-patch 's|ok, err = require "crowdsec".allowIp(ngx.var.remote_addr)|local ok, err = require "crowdsec".allowIp(ngx.var.remote_addr)|' /etc/nginx/lualib/plugins/crowdsec/access.lua
fi