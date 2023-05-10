#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Fail2ban configuration ...'

mkdir -p /fail2ban/{action.d,filter.d,jail.d,log}
chown -R "$PUID:$PGID" /fail2ban
mkdir -p /var/run/fail2ban
mkdir -p /data/logs/fail2ban
chown nobody:nogroup /data/logs/fail2ban
chmod 02755 /data/logs/fail2ban
