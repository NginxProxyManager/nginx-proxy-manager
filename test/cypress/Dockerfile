FROM cypress/included:9.4.1

COPY --chown=1000 ./test /test

WORKDIR /test
RUN yarn install && yarn cache clean
ENTRYPOINT []
CMD ["cypress", "run"]
