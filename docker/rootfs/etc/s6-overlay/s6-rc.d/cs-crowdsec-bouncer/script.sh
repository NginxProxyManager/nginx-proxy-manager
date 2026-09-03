#!/command/with-contenv bash

set -e # Exit immediately if a command exits with a non-zero status.

function set_properties() {
  sed -i "s,^$1=.*,$1=$2,g" "${3}"
}

echo "Deploy Crowdsec Openresty Bouncer.." 
if [ -n "${CROWDSEC_OPENRESTY_BOUNCER}" ]; then
   while IFS= read -r line
   do 
      if ! [[ "$line" != "^#" ]] || [[ "$line" != "^\n" ]]; then
        name=$(echo "$line" | cut -d "=" -f1)
        value=$(echo "$line" | cut -d "=" -f2)
        if grep -q "${name}" /defaults/crowdsec/crowdsec-openresty-bouncer.conf ; then
          set_properties "${name}" "${value}" "/defaults/crowdsec/crowdsec-openresty-bouncer.conf"
        fi
      fi
   done <<< "${CROWDSEC_OPENRESTY_BOUNCER}"
else
	mkdir -p /data/crowdsec/templates
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
fi


#Make sure we only copy files that don't exist in /data/crowdsec.
if [ -d "/data/crowdsec/templates" ]; then
    echo "Deploy Crowdsec Templates .."
    cd /defaults/crowdsec/templates/
    for file in *.html
    do
        if [ ! -e "/data/crowdsec/templates/${file}" ]
        then
            cp -r "/defaults/crowdsec/templates/${file}" "/data/crowdsec/templates/"
        fi
    done
fi