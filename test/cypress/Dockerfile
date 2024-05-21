FROM cypress/included:13.9.0

COPY --chown=1000 ./test /test

# Disable Cypress CLI colors
ENV FORCE_COLOR=0
ENV NO_COLOR=1

WORKDIR /test
RUN yarn install && yarn cache clean
ENTRYPOINT []
CMD ["cypress", "run"]
