#!/command/with-contenv bash
# shellcheck shell=bash

set -e

echo
echo "-------------------------------------
 _   _ ____  __  __
| \ | |  _ \|  \/  |
|  \| | |_) | |\/| |
| |\  |  __/| |  | |
|_| \_|_|   |_|  |_|
-------------------------------------"
if [[ "$PUID" -ne '0' ]]; then
	echo "User UID: $(id -u npmuser)"
	echo "User GID: $(id -g npmuser)"
	echo "-------------------------------------"
fi
echo
