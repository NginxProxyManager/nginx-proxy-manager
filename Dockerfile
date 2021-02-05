FROM jc21/alpine-nginx-full:node
LABEL maintainer="Jamie Curnow <jc@jc21.com>"

ENV SUPPRESS_NO_CONFIG_WARNING=1
ENV S6_FIX_ATTRS_HIDDEN=1
ENV NODE_ENV=production

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
	&& apk update \
	&& apk add python3 certbot jq \
	&& python3 -m ensurepip \
	&& rm -rf /var/cache/apk/*

# s6 overlay
COPY scripts/install-s6 /tmp/install-s6
RUN /tmp/install-s6 "${TARGETPLATFORM}" && rm -f /tmp/install-s6

EXPOSE 80
EXPOSE 81
EXPOSE 443

ADD backend             /app
ADD frontend/dist       /app/frontend
COPY global             /app/global

WORKDIR /app
RUN yarn install

# add late to limit cache-busting by modifications
COPY docker/rootfs      /

# Remove frontend service not required for prod, dev nginx config as well
RUN rm -rf /etc/services.d/frontend
RUN rm -f /etc/nginx/conf.d/dev.conf

VOLUME [ "/data", "/etc/letsencrypt" ]
ENTRYPOINT [ "/init" ]

HEALTHCHECK --interval=5s --timeout=3s CMD /bin/check-health