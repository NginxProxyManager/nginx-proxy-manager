FROM cypress/included:12.13.0

COPY --chown=1000 ./test /test

# Disable Cypress CLI colors
ENV FORCE_COLOR=0
ENV NO_COLOR=1

WORKDIR /test
RUN yarn install && yarn cache clean
ENTRYPOINT []
CMD ["cypress", "run"]
