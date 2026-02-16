FROM nginxproxymanager/testca AS testca
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

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
	&& apt-get update \
	&& apt-get install -y jq python3-pip logrotate moreutils \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# Task
WORKDIR /usr
RUN curl -sL https://taskfile.dev/install.sh | sh
WORKDIR /root

COPY rootfs /
COPY scripts/install-s6 /tmp/install-s6
RUN rm -f /etc/nginx/conf.d/production.conf \
	&& chmod 644 /etc/logrotate.d/nginx-proxy-manager \
	&& /tmp/install-s6 "${TARGETPLATFORM}" \
	&& rm -f /tmp/install-s6 \
	&& chmod 644 -R /root/.cache

# Certs for testing purposes
COPY --from=testca /home/step/certs/root_ca.crt /etc/ssl/certs/NginxProxyManager.crt

EXPOSE 80 81 443
ENTRYPOINT [ "/init" ]
