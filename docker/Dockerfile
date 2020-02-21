# This is a Dockerfile intended to be built using `docker buildx`
# for multi-arch support. Building with `docker build` may have unexpected results.

# This file assumes that the frontend has been built using ./scripts/frontend-build

FROM --platform=${TARGETPLATFORM:-linux/amd64} jc21/alpine-nginx-full:node

ARG TARGETPLATFORM
ARG BUILDPLATFORM
ARG BUILD_VERSION
ARG BUILD_COMMIT
ARG BUILD_DATE

ENV SUPPRESS_NO_CONFIG_WARNING=1
ENV S6_FIX_ATTRS_HIDDEN=1
ENV NODE_ENV=production

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
	&& rm -rf /etc/nginx \
	&& apk update \
	&& apk add python2 certbot jq \
	&& rm -rf /var/cache/apk/*

ENV NPM_BUILD_VERSION="${BUILD_VERSION}" NPM_BUILD_COMMIT="${BUILD_COMMIT}" NPM_BUILD_DATE="${BUILD_DATE}"

# s6 overlay
COPY scripts/install-s6 /tmp/install-s6
RUN /tmp/install-s6 "${TARGETPLATFORM}" && rm -f /tmp/install-s6

EXPOSE 80
EXPOSE 81
EXPOSE 443
EXPOSE 9876

COPY docker/rootfs      /
ADD backend             /app
ADD frontend/dist       /app/frontend

WORKDIR /app
RUN yarn install

# Remove frontend service not required for prod, dev nginx config as well
RUN rm -rf /etc/services.d/frontend RUN rm -f /etc/nginx/conf.d/dev.conf

VOLUME [ "/data", "/etc/letsencrypt" ]
CMD [ "/init" ]

HEALTHCHECK --interval=5s --timeout=3s CMD /bin/check-health
