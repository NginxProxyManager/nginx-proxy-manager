#!/usr/bin/env sh

set -e
umask 077

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 <public-name> <filename> [max-name-length (default 64)]" >&2
  exit 1
fi

if [ -s "/data/tls/ech/${2%.ech}-current.ech" ]; then mv "/data/tls/ech/${2%.ech}-current.ech" "/data/tls/ech/${2%.ech}-previous.ech"; fi

ECHPK=/tmp/private-key-${2%.ech}.bin
ECHCL=/tmp/config-list-${2%.ech}.bin

bssl generate-ech \
  -public-name "$1" \
  -max-name-length "${3:-64}" \
  -config-id "$(hexdump -n 1 -e '"%u"' /dev/urandom)" \
  -out-ech-config /dev/null \
  -out-ech-config-list "$ECHCL" \
  -out-private-key "$ECHPK"

{
  echo "-----BEGIN PRIVATE KEY-----"
  ( printf '\060\056\002\001\000\060\005\006\003\053\145\156\004\042\004\040'; cat "$ECHPK" ) | openssl base64
  echo "-----END PRIVATE KEY-----"
  echo "-----BEGIN ECHCONFIG-----"
  openssl base64 -in "$ECHCL"
  echo "-----END ECHCONFIG-----"
} > "/data/tls/ech/${2%.ech}-current.ech"

openssl base64 -A -in "$ECHCL"
echo

rm "$ECHPK" "$ECHCL"
