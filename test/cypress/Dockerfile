FROM cypress/included:14.0.1

# Disable Cypress CLI colors
ENV FORCE_COLOR=0
ENV NO_COLOR=1

# testssl.sh and mkcert
RUN wget "https://github.com/testssl/testssl.sh/archive/refs/tags/v3.2rc4.tar.gz" -O /tmp/testssl.tgz -q \
	&& tar -xzf /tmp/testssl.tgz -C /tmp \
	&& mv /tmp/testssl.sh-3.2rc4 /testssl \
	&& rm /tmp/testssl.tgz \
	&& apt-get update \
	&& apt-get install -y bsdmainutils curl dnsutils \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/* \
	&& wget "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-amd64" -O /bin/mkcert \
	&& chmod +x /bin/mkcert

COPY --chown=1000 ./test /test
WORKDIR /test
RUN yarn install && yarn cache clean
ENTRYPOINT []
CMD ["cypress", "run"]
