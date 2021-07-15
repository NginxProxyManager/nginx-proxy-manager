FROM jc21/nginx-full:github-no-acme-golang
LABEL maintainer="Jamie Curnow <jc@jc21.com>"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG GOPROXY
ARG GOPRIVATE

ENV GOPROXY=$GOPROXY \
	GOPRIVATE=$GOPRIVATE \
	S6_LOGGING=0 \
	SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_FIX_ATTRS_HIDDEN=1

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf

# Sqlite client and litecli client, and node
RUN curl -fsSL https://deb.nodesource.com/setup_14.x | bash - \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends nodejs \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/* \
	&& pip install -U litecli \
	&& npm install -g yarn

# Task
RUN cd /usr \
	&& curl -sL https://taskfile.dev/install.sh | sh \
	&& cd /root

COPY rootfs /
RUN rm -f /etc/nginx/conf.d/production.conf

# s6 overlay
RUN curl -L -o /tmp/s6-overlay-amd64.tar.gz "https://github.com/just-containers/s6-overlay/releases/download/v1.22.1.0/s6-overlay-amd64.tar.gz" \
	&& tar -xzf /tmp/s6-overlay-amd64.tar.gz -C /

# Fix for golang dev:
RUN chown -R 1000:1000 /opt/go

EXPOSE 80
CMD [ "/init" ]
HEALTHCHECK --interval=15s --timeout=3s CMD curl -f http://127.0.0.1:81/api || exit 1
