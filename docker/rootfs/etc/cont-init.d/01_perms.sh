#!/usr/bin/with-contenv bash
set -e

mkdir -p /data/logs
echo "Changing ownership of /data/logs to $(id -u):$(id -g)"
chown -R "$(id -u):$(id -g)" /data/logs

