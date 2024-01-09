FROM nginxproxymanager/nginx-full:certbot-node
LABEL maintainer="Jamie Curnow <jc@jc21.com>"

# See: https://github.com/just-containers/s6-overlay/blob/master/README.md
ENV SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=1 \
	S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 \
	S6_FIX_ATTRS_HIDDEN=1 \
	S6_KILL_FINISH_MAXTIME=10000 \
	S6_VERBOSITY=2 \
	NODE_OPTIONS="--openssl-legacy-provider"

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
	&& apt-get update \
	&& apt-get install -y jq python3-pip logrotate \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

# Task
RUN cd /usr \
	&& curl -sL https://taskfile.dev/install.sh | sh \
	&& cd /root

COPY rootfs /
RUN rm -f /etc/nginx/conf.d/production.conf
RUN chmod 644 /etc/logrotate.d/nginx-proxy-manager

# s6 overlay
COPY scripts/install-s6 /tmp/install-s6
RUN /tmp/install-s6 "${TARGETPLATFORM}" && rm -f /tmp/install-s6

EXPOSE 80 81 443
ENTRYPOINT [ "/init" ]
