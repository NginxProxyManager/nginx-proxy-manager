FROM nginxproxymanager/testca as testca
FROM letsencrypt/pebble as pebbleca
FROM nginxproxymanager/nginx-full:acmesh-golang
LABEL maintainer="Jamie Curnow <jc@jc21.com>"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG GOPROXY
ARG GOPRIVATE

ENV GOPROXY=$GOPROXY \
	GOPRIVATE=$GOPRIVATE \
	S6_LOGGING=0 \
	SUPPRESS_NO_CONFIG_WARNING=1 \
	ACMESH_CONFIG_HOME=/data/.acme.sh/config \
	ACMESH_HOME=/data/.acme.sh \
	CERT_HOME=/data/.acme.sh/certs \
	LE_CONFIG_HOME=/data/.acme.sh/config \
	LE_WORKING_DIR=/data/.acme.sh \
	CGO_ENABLED=1 \
	GO111MODULE=on

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf

# usql and node
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash - \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends nodejs vim dnsutils \
	&& npm install --location=global yarn \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/* \
	&& go install github.com/xo/usql@master

# Task
RUN cd /usr \
	&& curl -sL https://taskfile.dev/install.sh | sh \
	&& cd /root

COPY docker/rootfs /
RUN rm -f /etc/nginx/conf.d/production.conf

# s6 overlay
COPY scripts/install-s6 /tmp/install-s6
RUN /tmp/install-s6 && rm -rf /tmp/*
#RUN curl -L -o /tmp/s6-overlay-amd64.tar.gz "https://github.com/just-containers/s6-overlay/releases/download/v1.22.1.0/s6-overlay-amd64.tar.gz" \
#	&& tar -xzf /tmp/s6-overlay-amd64.tar.gz -C /

# Fix for golang dev:
RUN chown -R 1000:1000 /opt/go

COPY --from=pebbleca /test/certs/pebble.minica.pem /etc/ssl/certs/pebble.minica.pem
COPY --from=testca /home/step/certs/root_ca.crt /etc/ssl/certs/NginxProxyManager.crt

EXPOSE 80
CMD [ "/init" ]
HEALTHCHECK --interval=15s --timeout=3s CMD curl -f http://127.0.0.1:81/api || exit 1
