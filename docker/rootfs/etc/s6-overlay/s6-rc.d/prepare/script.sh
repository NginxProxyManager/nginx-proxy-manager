#!/command/with-contenv bash
set -e

DATA_PATH=/data
PUID=${PUID:-911}
PGID=${PGID:-911}

# Ensure /data is mounted
if [ ! -d "$DATA_PATH" ]; then
	echo '--------------------------------------'
	echo "ERROR: $DATA_PATH is not mounted! Check your docker configuration."
	echo '--------------------------------------'
	/run/s6/basedir/bin/halt
	exit 1
fi

echo "❯ Checking folder structure ..."

# Create required folders
mkdir -p /tmp/nginx/body \
	/run/nginx \
	/var/log/nginx \
	/var/lib/nginx/cache/public \
	/var/lib/nginx/cache/private \
	/var/cache/nginx/proxy_temp \
	/data/logs
touch /var/log/nginx/error.log && chmod 777 /var/log/nginx/error.log && chmod -R 777 /var/cache/nginx
# Dynamically generate resolvers file
echo resolver "$(awk 'BEGIN{ORS=" "} $1=="nameserver" {print $2}' /etc/resolv.conf)" ";" > /etc/nginx/conf.d/include/resolvers.conf
# Fire off acme.sh wrapper script to "install" itself if required
acme.sh -h > /dev/null 2>&1

# Add npmuser user
echo "❯ Creating user ..."
groupmod -g 1000 users || exit 1
useradd -u "${PUID}" -U -d /data -s /bin/false npmuser || exit 1
usermod -G users npmuser || exit 1
groupmod -o -g "$PGID" npmuser || exit 1
chown -R npmuser:npmuser /data
chown -R npmuser:npmuser /run/nginx
chown -R npmuser:npmuser /etc/nginx
chown -R npmuser:npmuser /tmp/nginx
chown -R npmuser:npmuser /var/cache/nginx
chown -R npmuser:npmuser /var/lib/nginx
chown -R npmuser:npmuser /var/log/nginx
# Home for npmuser
mkdir -p /tmp/npmuserhome
chown -R npmuser:npmuser /tmp/npmuserhome

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
