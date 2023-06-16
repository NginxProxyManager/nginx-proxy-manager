#!/bin/sh

echo "
-------------------------------------
 _   _ ____  __  __
| \ | |  _ \|  \/  |
|  \| | |_) | |\/| |
| |\  |  __/| |  | |
|_| \_|_|   |_|  |_|
-------------------------------------
User:     $(whoami)
PUID:     $PUID
User ID:  $(id -u)
PGID:     $PGID
Group ID: $(id -g)
-------------------------------------
"

if ! nginx -t > /dev/null 2>&1; then
    nginx -T
    sleep inf
fi

if [ "$PHP81" = "true" ]; then
    if ! PHP_INI_SCAN_DIR=/data/php/81/conf.d php-fpm81 -c /data/php/81 -y /data/php/81/php-fpm.conf -FORt > /dev/null 2>&1; then
        PHP_INI_SCAN_DIR=/data/php/81/conf.d php-fpm81 -c /data/php/81 -y /data/php/81/php-fpm.conf -FORt
        sleep inf
    fi
fi

if [ "$PHP82" = "true" ]; then
    if ! PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FORt > /dev/null 2>&1; then
        PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FORt
        sleep inf
    fi
fi

if [ "$PHP81" = "true" ]; then PHP_INI_SCAN_DIR=/data/php/81/conf.d php-fpm81 -c /data/php/81 -y /data/php/81/php-fpm.conf -FOR; fi &
if [ "$PHP82" = "true" ]; then PHP_INI_SCAN_DIR=/data/php/82/conf.d php-fpm82 -c /data/php/82 -y /data/php/82/php-fpm.conf -FOR; fi &
index.js &
wait
