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
-------------------------------------
User UID: $(id -u npmuser)
User GID: $(id -g npmuser)
-------------------------------------
"
