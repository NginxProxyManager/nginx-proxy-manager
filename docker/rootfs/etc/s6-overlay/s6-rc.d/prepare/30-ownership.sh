#!/command/with-contenv bash
# shellcheck shell=bash

set -e

log_info 'Setting ownership ...'

# root
chown root /tmp/nginx

# npmuser
chown -R npmuser:npmuser /data
chown -R npmuser:npmuser /etc/letsencrypt
chown -R npmuser:npmuser /run/nginx
chown -R npmuser:npmuser /tmp/nginx
chown -R npmuser:npmuser /var/cache/nginx
chown -R npmuser:npmuser /var/lib/logrotate
chown -R npmuser:npmuser /var/lib/nginx
chown -R npmuser:npmuser /var/log/nginx

# Don't chown entire /etc/nginx folder as this causes crashes on some systems
chown -R npmuser:npmuser /etc/nginx/nginx.conf
chown -R npmuser:npmuser /etc/nginx/conf.d
