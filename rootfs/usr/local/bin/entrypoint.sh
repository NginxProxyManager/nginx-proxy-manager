#!/usr/bin/env sh

if [ -n "$(ls -A /data/prerun 2> /dev/null)" ]; then
    for script in /data/prerun/*.sh; do
        echo "Exexcuting prerun script: $script"
        chmod +x "$script"
        "$script"
    done
fi

exec start.sh
