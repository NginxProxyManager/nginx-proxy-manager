#!/bin/sh

if [ -n "$(ls -A /data/etc/prerun 2> /dev/null)" ]; then
    for script in /data/etc/prerun/*.sh; do
        echo "Exexcuting prerun script: $script"
        chmod +x "$script"
        "$script"
    done
fi

exec start.sh
