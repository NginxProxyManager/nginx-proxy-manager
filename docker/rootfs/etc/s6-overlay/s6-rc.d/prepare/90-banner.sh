#!/command/with-contenv bash
# shellcheck shell=bash

set -e
set +x

. /etc/os-release

echo "
-------------------------------------
 _   _ ____  __  __
| \ | |  _ \|  \/  |
|  \| | |_) | |\/| |
| |\  |  __/| |  | |
|_| \_|_|   |_|  |_|
-------------------------------------
Version:   ${NPM_BUILD_VERSION:-3.0.0-dev} (${NPM_BUILD_COMMIT:-dev}) ${NPM_BUILD_DATE:-0000-00-00}
User:      $NPMUSER PUID:$PUID ID:$(id -u "$NPMUSER") GROUP:$(id -g "$NPMUSER")
Group:     $NPMGROUP PGID:$PGID ID:$(get_group_id "$NPMGROUP")
OpenResty: ${OPENRESTY_VERSION:-unknown}
Debian:    ${VERSION_ID:-unknown}
Kernel:    $(uname -r)
-------------------------------------
"
