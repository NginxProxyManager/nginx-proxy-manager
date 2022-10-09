#!/usr/bin/with-contenv bash
# shellcheck shell=bash

set -e # Exit immediately if a command exits with a non-zero status.
set -u # Treat unset variables as an error.

log() {
  echo -e "${BLUE}[cont-init.d] ${RED}$(basename "$0")${CYAN}>>>${RESET} $*"
}

if [ "${CROWDSEC_BOUNCER}" == "1" ] || [ "${CROWDSEC_BOUNCER}" -eq 1 ]; then
  log "Enabling CrowdSec OpenResty Bouncer"
  mkdir -p /data/crowdsec
  if [ ! -f /data/crowdsec/crowdsec-openresty-bouncer.conf ]; then
    #Install Crowdsec Bouncer Config.
    cp /crowdsec/crowdsec-openresty-bouncer.conf.template /data/crowdsec/crowdsec-openresty-bouncer.conf
    log "Crowdsec OpenResty Bouncer Config copied to /data/crowdsec/crowdsec-openresty-bouncer.conf"
  fi
  # Create lualib plugin directory for crowdsec and move crowdsec lua libs into it
  log "Creating CrowdSec lualib directories in /etc/nginx"
  mkdir -p /etc/nginx/lualib/plugins/crowdsec/
  log "Copying CrowdSec Lua libraries to /etc/nginx/lualib/plugins/crowdsec/"
  cp -r /crowdsec/lua/lib/* /etc/nginx/lualib/
  # This initilizes crowdsec as /etc/nginx/conf.d/* is included in nginx.conf
  # Fixes -> SSL_CTX_load_verify_locations("/etc/nginx/${SSL_CERTS_PATH}") failed (SSL: error:02001002:system library:fopen:No such file or directory:fopen('/etc/nginx/${SSL_CERTS_PATH}','r') error:2006D080:BIO routines:BIO_new_file:no such file error:0B084002:x509 certificate routines:X509_load_cert_crl_file:system lib)
  log "envsubst \${SSL_CERTS_PATH} (${SSL_CERTS_PATH}) in crowdsec_openresty.conf"
  SSL_CERTS_PATH=${SSL_CERTS_PATH} envsubst < /crowdsec/crowdsec_openresty.conf > /etc/nginx/conf.d/crowdsec_openresty.conf
#  cp /crowdsec/crowdsec_openresty.conf /etc/nginx/conf.d/
  else
  log "CrowdSec OpenResty Bouncer Disabled"
fi