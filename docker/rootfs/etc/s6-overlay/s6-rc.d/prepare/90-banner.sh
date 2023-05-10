#!/command/with-contenv bash
# shellcheck shell=bash

set -e
set +x

echo "
-------------------------------------
 _   _ ____  __  __
| \ | |  _ \|  \/  |
|  \| | |_) | |\/| |
| |\  |  __/| |  | |
|_| \_|_|   |_|  |_|
-------------------------------------
User:  $NPMUSER PUID:$PUID ID:$(id -u "$NPMUSER") GROUP:$(id -g "$NPMUSER")
Group: $NPMGROUP PGID:$PGID ID:$(get_group_id "$NPMGROUP")
-------------------------------------
"
