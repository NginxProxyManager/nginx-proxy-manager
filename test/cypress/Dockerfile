FROM cypress/included:13.15.1

COPY --chown=1000 ./test /test

# Disable Cypress CLI colors by default
ARG FORCE_COLOR=0
ARG NO_COLOR=1
ENV FORCE_COLOR=$FORCE_COLOR \
	NO_COLOR=$NO_COLOR

WORKDIR /test
RUN yarn install && yarn cache clean
ENTRYPOINT []
CMD ["cypress", "run"]
