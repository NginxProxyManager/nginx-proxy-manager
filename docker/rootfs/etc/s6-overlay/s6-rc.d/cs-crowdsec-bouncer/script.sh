#!/command/with-contenv bash

set -e # Exit immediately if a command exits with a non-zero status.

mkdir -p /data/crowdsec/templates
echo "Deploy Crowdsec Openresty Bouncer.." 
sed -i 's|/defaults/crowdsec|/data/crowdsec|' /etc/nginx/conf.d/crowdsec_openresty.conf

if [ -f /data/crowdsec/crowdsec-openresty-bouncer.conf ]; then
    echo "Patch crowdsec-openresty-bouncer.conf .." 
    sed "s/=.*//g" /data/crowdsec/crowdsec-openresty-bouncer.conf > /tmp/crowdsec.conf.raw
    sed "s/=.*//g" /defaults/crowdsec/crowdsec-openresty-bouncer.conf > /tmp/crowdsec-openresty-bouncer.conf.raw
    if grep -vf /tmp/crowdsec.conf.raw /tmp/crowdsec-openresty-bouncer.conf.raw ; then
        grep -vf /tmp/crowdsec.conf.raw /tmp/crowdsec-openresty-bouncer.conf.raw > /tmp/config.newvals
        cp /data/crowdsec/crowdsec-openresty-bouncer.conf /data/crowdsec/crowdsec-openresty-bouncer.conf.bak
        grep -f /tmp/config.newvals /defaults/crowdsec/crowdsec-openresty-bouncer.conf >> /data/crowdsec/crowdsec-openresty-bouncer.conf
    fi
else
    echo "Deploy new crowdsec-openresty-bouncer.conf .." 
    cp /defaults/crowdsec/crowdsec-openresty-bouncer.conf /data/crowdsec/crowdsec-openresty-bouncer.conf    
fi
#Make sure the config location is where we get the config from instead of /default/
sed -i 's|/defaults/crowdsec|/data/crowdsec|' /data/crowdsec/crowdsec-openresty-bouncer.conf
echo "Deploy Crowdsec Templates .."
#Make sure we only copy files that don't exist in /data/crowdsec.
cd /defaults/crowdsec/templates/
for file in *.html
do
  if [ ! -e "/data/crowdsec/templates/${file}" ]
  then
    cp -r "/defaults/crowdsec/templates/${file}" "/data/crowdsec/templates/"
  fi
done