#!/usr/bin/env bash
set -euf -o pipefail

HEALTHY="$(curl --silent "http://127.0.0.1:3000/api" | jq --raw-output '.result.healthy')"

echo "Healthy: ${HEALTHY}"
[ "$HEALTHY" = 'true' ] || exit 1
