FROM owenscorning/aws-nginx-full:certbot-node

ENV S6_LOGGING=0 \
	SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_FIX_ATTRS_HIDDEN=1

RUN yum makecache \
	&& yum install -y \
	certbot jq python3-pip logrotate \
	\
	&& yum clean all \
	&& rm -rf /var/cache/* /var/log/* /tmp/*

# Task
RUN cd /usr \
	&& curl -sL https://taskfile.dev/install.sh | sh \
	&& cd /root

COPY rootfs /
RUN rm -f /etc/nginx/conf.d/production.conf
RUN chmod 644 /etc/logrotate.d/nginx-proxy-manager

# s6 overlay
RUN curl -L -o /tmp/s6-overlay-amd64.tar.gz "https://github.com/just-containers/s6-overlay/releases/download/v1.22.1.0/s6-overlay-amd64.tar.gz" \
	&& tar -xzf /tmp/s6-overlay-amd64.tar.gz -C /

EXPOSE 80 81 443
ENTRYPOINT [ "/init" ]

