FROM cypress/included:12.13.0

COPY --chown=1000 ./test /test

WORKDIR /test
RUN yarn install && yarn cache clean
ENTRYPOINT []
CMD ["cypress", "run", "--config-file=/test/cypress/config/ci.js"]
