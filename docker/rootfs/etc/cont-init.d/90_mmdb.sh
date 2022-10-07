#!/usr/bin/with-contenv bash
# shellcheck shell=bash

log() {
  echo -e "${BLUE}[cont-init.d] ${RED}$(basename "$0")${CYAN}>>>${RESET} $*"
}

if [[ -n "${GEOLITE2_DB_GRAB}" ]]; then
  if [[ "${GEOLITE2_DB_GRAB}" == "1" ]] || [[ "${GEOLITE2_DB_GRAB}" -eq 1 ]]; then
    log "GeoLite2 DB Grab configured, installing/updating GeoLite2 Database's"
    geo2="${GEOIP_DIR:-/geoip}/2"
    mkdir -p "$geo2/tmp"
    GEOIP2_DB_URLS=(
      "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb"
      "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-Country.mmdb"
      "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-ASN.mmdb"
    )
    # download new dbs and diff them, update if different
    for db in "${GEOIP2_DB_URLS[@]}"; do
      log "Downloading ${db##*/} from ${db%/*}..."
      curl -s -L -o "${geo2}/tmp/${db##*/}" "$db"
      if [ "$?" -ne 0 ]; then
          log "Failed to download ${db##*/} from ${db%/*}!"
          exit 1
      fi

      if [ -f "${geo2}/${db##*/}" ]; then
          log "Diffing ${db##*/}..."
          diff "${geo2}/${db##*/}" "${geo2}/tmp/${db##*/}"
          if [ "$?" -eq 0 ]; then
          log "${db##*/} is up to date..."
          else
          log "${db##*/} is different, updating db..."
          mv "${geo2}/tmp/${db##*/}" "${geo2}/${db##*/}"
          fi
      else
          log "${db##*/} does not exist, installing..."
          mv "${geo2}/tmp/${db##*/}" "${geo2}/${db##*/}"
      fi
    done
    rm -rf "${geo2}/tmp/"
  fi
fi

if [[ -n "${GEOLITE_DB_GRAB}" ]]; then
  if [ "${GEOLITE_DB_GRAB}" == "1" ] || [ "${GEOLITE2_DB_GRAB}" -eq 1 ]; then
    log "GeoLite LEGACY DB Grab configured, downloading GeoLite LEGACY Database's"

    geo1="${GEOIP_DIR:-/geoip}/1"
    mkdir -p "$geo1"


    # If http proxy needed
    #https_proxy="http://foo.bar:3128"
    export https_proxy
    for f in $GeoIP_1_FILES; do
      # Make sure .gz is stripped
      f=${f%*.gz}
      # Make sure .dat exists
      if [[ ! "$f" =~ \.csv ]]; then f=${f%*.dat}.dat; fi
      wget -nv -T 30 --max-redirect 0 "https://mailfud.org/geoip-legacy/$f.gz"
      RET=$?
      if [ $RET -ne 0 ]; then
          log "wget $f.gz failed: $RET" >&2
          continue
      fi
      # Unpack and replace files atomically
      if gzip -dc "$f.gz" >"$f.tmp"; then
          if [[ -f "${geo1}/${f}" ]]; then
              if ! diff "${geo1}/${f}" "$f".tmp >/dev/null 2>&1; then
                  log "${geo1}/${f} is different, updating db..."
                  chmod 644 "$f.tmp"
                  /bin/mv -f "$f.tmp" "${geo1}/${f}"
              else
                  log "${geo1}/${f} is up to date..."
              fi
          else
              log "${geo1}/${f} does not exist, installing..."
              chmod 644 "$f.tmp"
              /bin/mv -f "$f.tmp" "${geo1}/${f}"
          fi
      else
          log "gunzip $f failed" >&2
          rm -f "$f.gz"
      fi
      rm -f "$f.tmp"
    done
  fi
fi
