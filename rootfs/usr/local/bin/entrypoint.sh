#!/bin/sh

cd / || exit

for patch in /data/etc/prerun/patches/*.patch; do
    [ -e "$patch" ] || break
    echo "Applying prerun patch using patch -p1: $patch"
    patch -p1 <"$patch"
done

for script in /data/etc/prerun/scripts/*.sh; do
    [ -e "$patch" ] || break
    echo "Exexcuting prerun script: $script"
    chmod +x "$script"
    "$script"
done

cd /app || exit

start.sh
