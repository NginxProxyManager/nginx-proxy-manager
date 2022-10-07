#!/usr/bin/with-contenv bash
# shellcheck shell=bash

# Update CrowdSec OpenResty bouncer, allows for overriding the 99 init file and crowdsec_openresty.conf

log() {
  echo -e "${BLUE}[cont-init.d] ${RED}$(basename "$0")${CYAN}>>>${RESET} $*"
}

if [ -n "${CROWDSEC_UPDATE_DIR}" ]; then
  mkdir -p "${CROWDSEC_UPDATE_DIR:-/cs-update}"
  log "Evaluating Crowdsec update files located at ${CROWDSEC_UPDATE_DIR}"

  for entry in "${CROWDSEC_UPDATE_DIR}"/*; do
    if [[ "$entry" == "$CROWDSEC_UPDATE_DIR"'/*' ]]; then
      log "Nothing found in the upgrade directory, using current release"
      break
    fi
    basepath_=${entry##*/}
    ext_=${entry##*.}
    dest_="/etc/nginx/lualib/"
    type_=""
    succ=0
    log_msg=""
    # File
    if [[ -f "$entry" ]]; then
      type_="file"
      [[ $ext_ == "lua" ]] && succ=1
      [[ $basepath_ == "crowdsec_openresty.conf" ]] && dest_="/etc/nginx/conf.d/" && succ=1
      [[ $basepath_ == "99_crowdsec-openresty-bouncer.sh" ]] && dest_="/etc/cont-init.d/" && succ=1
    # Directory
    elif [[ -d "$entry" ]]; then
      type_="directory"
      [[ $basepath_ == "plugins" ]] && succ=1
    else
      log "IDK WTF MAN, its not a file or a directory?"
      continue
    fi
#      log "Found ${type_}: $entry | extension: $ext_ | success: $succ | basepath: $basepath_"
    log_msg="UPGRADED! Copied '$type_' $entry to $dest_"
    if [[ "${succ}" -eq 2 ]]; then
      cp '-r' "${entry}" "${dest_}"
    elif [[ "${succ}" -eq 1 ]]; then
      cp "${entry}" "${dest_}"
    elif [[ "${succ}" -eq 0 ]]; then
      log_msg="Ignoring $type_ -> $entry"
    else
      log_msg="ERROR> something is wrong! value: $succ should be between 0 and 2"
    fi
    log "$log_msg"
  done
fi
