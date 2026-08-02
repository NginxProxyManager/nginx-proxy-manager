FROM nginxproxymanager/testca AS testca
FROM shinsenter/s6-overlay:v3.2.3.0 AS s6-overlay
FROM nginxproxymanager/nginx-full:certbot-node
LABEL maintainer="Jamie Curnow <jc@jc21.com>"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=1 \
	S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 \
	S6_FIX_ATTRS_HIDDEN=1 \
	S6_KILL_FINISH_MAXTIME=10000 \
	S6_VERBOSITY=2 \
	NODE_OPTIONS="--openssl-legacy-provider"

# Default to Debian's official mirror. The SQLite development Compose override supplies
# a domestic mirror through this build arg, without changing the normal dev workflow.
ARG DEBIAN_MIRROR="https://deb.debian.org"

RUN set -eux; \
	for source_file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do \
		[ -f "${source_file}" ] || continue; \
		sed -i \
			-e "s|http://deb.debian.org/debian-security|${DEBIAN_MIRROR}/debian-security|g" \
			-e "s|https://deb.debian.org/debian-security|${DEBIAN_MIRROR}/debian-security|g" \
			-e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}/debian|g" \
			-e "s|https://deb.debian.org/debian|${DEBIAN_MIRROR}/debian|g" \
			"${source_file}"; \
	done; \
	# Node is already included by the nginx-full:certbot-node base image. Avoid updating
	# the external NodeSource index when this image only installs OS utilities.
	rm -f /etc/apt/sources.list.d/*nodesource*; \
	echo "fs.file-max = 65535" > /etc/sysctl.conf; \
	apt-get update; \
	apt-get install -y jq python3-pip logrotate moreutils; \
	apt-get clean; \
	rm -rf /var/lib/apt/lists/*

# The dev image does not invoke Task. Do not fetch it from GitHub during image builds;
# removing that network-only install keeps local rebuilds deterministic and cache-friendly.
WORKDIR /usr

# The S6 overlay is copied from a Docker Hub build-stage image rather than downloaded
# from GitHub during every local Docker build. This keeps the development stack
# buildable when Docker Desktop cannot reach GitHub directly.
COPY --from=s6-overlay /init /init
COPY --from=s6-overlay /command /command
COPY --from=s6-overlay /package /package
COPY --from=s6-overlay /etc/s6-overlay /etc/s6-overlay

COPY rootfs /

RUN rm -f /etc/nginx/conf.d/production.conf.template \
	&& chmod 644 /etc/logrotate.d/nginx-proxy-manager \
	&& chmod 644 -R /root/.cache

# Copy test CA cert for use in container and add to trusted certs from a self-signed CA
COPY --from=testca /home/step/certs/root_ca.crt /etc/ssl/certs/NginxProxyManager.crt
WORKDIR /etc/ssl/certs
RUN ln -s NginxProxyManager.crt 1d0e3f10.0 && update-ca-certificates

WORKDIR /root

EXPOSE 80 81 443
ENTRYPOINT [ "/init" ]
